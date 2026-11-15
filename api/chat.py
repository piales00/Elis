import inspect
import json
import os
from typing import Any, AsyncIterator, Callable

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.chat_guard import limiter, validate_chat_request, verify_figures
from api.chat_prompt import build_system_blocks, SYSTEM_PROMPT_TEXT
from api.chat_tools import TOOL_LABELS, TOOLS, VALID_REGIONS, execute_tool


DEFAULT_PROVIDER = "gemini"
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"
DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"
DEFAULT_EFFORT = "low"
MAX_TOKENS = 4000
MAX_TOOL_TURNS = 6
FALLBACK_BETA = "server-side-fallback-2026-07-01"

router = APIRouter()

_client_factory: Callable[[], Any] | None = None


def set_client_factory(factory: Callable[[], Any] | None) -> None:
    global _client_factory
    _client_factory = factory


def get_chat_provider() -> str:
    provider = os.environ.get("CHAT_PROVIDER", "").strip().lower()
    if provider in ("gemini", "anthropic"):
        return provider
    if os.environ.get("GEMINI_API_KEY", "").strip():
        return "gemini"
    return "anthropic"


def get_chat_model() -> str:
    provider = get_chat_provider()
    default = DEFAULT_GEMINI_MODEL if provider == "gemini" else DEFAULT_CLAUDE_MODEL
    return os.environ.get("CHAT_MODEL", default).strip() or default


def get_chat_effort() -> str:
    effort = os.environ.get("CHAT_EFFORT", DEFAULT_EFFORT).strip().lower()
    return effort if effort in ("low", "medium", "high") else DEFAULT_EFFORT


def is_chat_enabled() -> tuple[bool, str]:
    if os.environ.get("CHAT_ENABLED", "0").strip() != "1":
        return False, "The data assistant is currently disabled (CHAT_ENABLED is not set to 1)."
    if _client_factory is not None:
        return True, ""
    provider = get_chat_provider()
    if provider == "gemini":
        if not os.environ.get("GEMINI_API_KEY", "").strip():
            return False, "The data assistant is not configured (GEMINI_API_KEY is missing)."
        return True, ""
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return False, "The data assistant is not configured (ANTHROPIC_API_KEY is missing)."
    return True, ""


def _create_client() -> Any:
    if _client_factory is not None:
        return _client_factory()
    provider = get_chat_provider()
    if provider == "gemini":
        from google import genai
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        return genai.Client(api_key=api_key)
    from anthropic import AsyncAnthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return AsyncAnthropic(api_key=api_key)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    region: str | None = None
    locale: str | None = None


def _format_sse(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _build_auto_chart(
    tool_calls_made: list[tuple[str, dict[str, Any], dict[str, Any]]],
    default_region: str | None,
) -> dict[str, Any] | None:
    if not tool_calls_made:
        return None
    if any(name == "show_chart" for name, _, _ in tool_calls_made):
        return None

    reg = default_region if default_region in VALID_REGIONS else "peru"
    for name, inp, res in tool_calls_made:
        if isinstance(inp, dict) and inp.get("region") in VALID_REGIONS:
            reg = inp["region"]
        if name == "rank_years" and isinstance(res, dict):
            rankings = res.get("rankings") or []
            top_year = rankings[0].get("year") if rankings else 2024
            from_y = int(inp.get("from_year", 2003)) if isinstance(inp, dict) else 2003
            to_y = int(inp.get("to_year", 2025)) if isinstance(inp, dict) else 2025
            chart_ev, err = execute_tool(
                "show_chart",
                {
                    "chart": "series",
                    "region": reg,
                    "from_year": max(2000, from_y),
                    "to_year": min(2026, to_y),
                    "highlight_year": top_year,
                },
            )[2], False
            if chart_ev:
                return chart_ev
        if name == "compare_periods" and isinstance(res, dict):
            pa = res.get("period_a") or {}
            pb = res.get("period_b") or {}
            ya = pa.get("year") or 2024
            yb = pb.get("year") or 2025
            hi = max(int(ya), int(yb))
            chart_type = "year_vs_history" if pa.get("kind") == "month" else "series"
            chart_ev = execute_tool(
                "show_chart",
                {
                    "chart": chart_type,
                    "region": reg,
                    "from_year": min(int(ya), int(yb), 2003),
                    "to_year": max(int(ya), int(yb), 2025),
                    "highlight_year": hi,
                },
            )[2]
            if chart_ev:
                return chart_ev
        if name == "get_series" and isinstance(inp, dict):
            from_y = int(inp.get("from_year", 2003))
            to_y = int(inp.get("to_year", 2026))
            agg = inp.get("aggregate", "year")
            chart_type = "year_vs_history" if agg == "month" and from_y == to_y else "series"
            chart_ev = execute_tool(
                "show_chart",
                {
                    "chart": chart_type,
                    "region": reg,
                    "from_year": from_y,
                    "to_year": to_y,
                    "highlight_year": to_y,
                },
            )[2]
            if chart_ev:
                return chart_ev
    return None


def _prepare_messages(
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> list[dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        prepared.append({"role": role, "content": content})
    if prepared and prepared[-1]["role"] == "user":
        extra: list[str] = []
        if region:
            extra.append(f"active screen region: {region}")
        if locale:
            extra.append(f"user locale: {locale}")
        if extra:
            suffix = f"\n\n[Context: {', '.join(extra)}]"
            prepared[-1]["content"] = f"{prepared[-1]['content']}{suffix}"
    return prepared


def _build_gemini_tools() -> list[Any]:
    from google.genai import types
    declarations = []
    for t in TOOLS:
        schema_props = {}
        input_props = t["input_schema"].get("properties", {})
        for k, v in input_props.items():
            prop_type = types.Type.STRING
            if v.get("type") == "integer":
                prop_type = types.Type.INTEGER
            elif v.get("type") == "number":
                prop_type = types.Type.NUMBER
            elif v.get("type") == "boolean":
                prop_type = types.Type.BOOLEAN
            enum_vals = v.get("enum")
            schema_props[k] = types.Schema(
                type=prop_type,
                description=v.get("description"),
                enum=enum_vals,
            )
        declarations.append(
            types.FunctionDeclaration(
                name=t["name"],
                description=t["description"],
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties=schema_props,
                    required=t["input_schema"].get("required", []),
                ),
            )
        )
    return [types.Tool(function_declarations=declarations)]


def _normalize_usage(usage_obj: Any) -> dict[str, int]:
    if usage_obj is None:
        return {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
        }
    if isinstance(usage_obj, dict):
        return {
            "input_tokens": int(usage_obj.get("input_tokens", 0) or 0),
            "output_tokens": int(usage_obj.get("output_tokens", 0) or 0),
            "cache_read_input_tokens": int(usage_obj.get("cache_read_input_tokens", 0) or 0),
            "cache_creation_input_tokens": int(usage_obj.get("cache_creation_input_tokens", 0) or 0),
        }
    return {
        "input_tokens": int(getattr(usage_obj, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage_obj, "output_tokens", 0) or 0),
        "cache_read_input_tokens": int(getattr(usage_obj, "cache_read_input_tokens", 0) or 0),
        "cache_creation_input_tokens": int(getattr(usage_obj, "cache_creation_input_tokens", 0) or 0),
    }


def _open_stream(client: Any, **kwargs: Any) -> Any:
    beta_messages = getattr(getattr(client, "beta", None), "messages", None)
    if beta_messages is not None and hasattr(beta_messages, "stream"):
        stream_fn = beta_messages.stream
        try:
            sig = inspect.signature(stream_fn)
            accepts_var_kw = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
            filtered_kwargs = (
                kwargs
                if accepts_var_kw
                else {k: v for k, v in kwargs.items() if k in sig.parameters}
            )
            return stream_fn(**filtered_kwargs)
        except (TypeError, ValueError):
            pass

    messages_api = getattr(client, "messages", None)
    if messages_api is not None and hasattr(messages_api, "stream"):
        fallback_kwargs = {k: v for k, v in kwargs.items() if k not in ("betas", "fallbacks")}
        return messages_api.stream(**fallback_kwargs)
    raise RuntimeError("Client does not expose a compatible stream method.")


async def _stream_gemini_turns(
    client: Any,
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> AsyncIterator[str]:
    from google.genai import types

    model = get_chat_model()
    gemini_tools = _build_gemini_tools()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT_TEXT,
        tools=gemini_tools,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
        temperature=0.2,
    )

    prepared = _prepare_messages(messages, region, locale)
    contents: list[types.Content] = []
    for m in prepared:
        role = "user" if m["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=m["content"])]))

    accumulated_text_parts: list[str] = []
    tool_results_for_guard: list[dict[str, Any]] = []
    tool_calls_made: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
    chart_emitted = False
    total_usage = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }

    try:
        for _ in range(MAX_TOOL_TURNS):
            resp = await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            if hasattr(resp, "usage_metadata") and resp.usage_metadata:
                total_usage["input_tokens"] += int(getattr(resp.usage_metadata, "prompt_token_count", 0) or 0)
                total_usage["output_tokens"] += int(getattr(resp.usage_metadata, "candidates_token_count", 0) or 0)

            fcalls = resp.function_calls or []
            if not fcalls:
                # If text was already returned in the non-streaming response:
                if resp.text:
                    accumulated_text_parts.append(resp.text)
                    yield _format_sse("text", {"delta": resp.text})
                else:
                    # Stream synthesis using config without tools to force final text
                    config_synthesis = types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT_TEXT,
                        thinking_config=types.ThinkingConfig(thinking_budget=0),
                        temperature=0.2,
                    )
                    async for chunk in await client.aio.models.generate_content_stream(
                        model=model,
                        contents=contents,
                        config=config_synthesis,
                    ):
                        chunk_text = chunk.text or ""
                        if chunk_text:
                            accumulated_text_parts.append(chunk_text)
                            yield _format_sse("text", {"delta": chunk_text})
                break

            # Handle tool calls
            candidate_content = resp.candidates[0].content
            contents.append(candidate_content)

            tool_response_parts = []
            for fc in fcalls:
                call_id = getattr(fc, "id", None) or f"call_{fc.name}"
                tool_label = TOOL_LABELS.get(fc.name, fc.name)
                yield _format_sse(
                    "tool",
                    {"name": fc.name, "id": call_id, "label": tool_label, "input": fc.args or {}},
                )
                tool_result, is_err, chart_event = execute_tool(fc.name, fc.args or {})
                tool_results_for_guard.append(tool_result)
                if not is_err:
                    tool_calls_made.append((fc.name, fc.args or {}, tool_result))

                if chart_event is not None and not is_err:
                    chart_emitted = True
                    yield _format_sse("chart", chart_event)

                tool_response_parts.append(
                    types.Part.from_function_response(
                        name=fc.name,
                        response={"result": tool_result},
                    )
                )

            contents.append(types.Content(role="user", parts=tool_response_parts))

        if not chart_emitted and tool_calls_made:
            auto_chart = _build_auto_chart(tool_calls_made, region)
            if auto_chart is not None:
                chart_emitted = True
                yield _format_sse("chart", auto_chart)

        # If loop reached MAX_TOOL_TURNS and no text has been generated yet, force a synthesis turn
        if not accumulated_text_parts:
            config_synthesis = types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT_TEXT,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
                temperature=0.2,
            )
            async for chunk in await client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config_synthesis,
            ):
                chunk_text = chunk.text or ""
                if chunk_text:
                    accumulated_text_parts.append(chunk_text)
                    yield _format_sse("text", {"delta": chunk_text})

        final_text = "".join(accumulated_text_parts)
        verification = verify_figures(final_text, tool_results_for_guard)
        if not verification.get("verified", True):
            yield _format_sse(
                "notice",
                {
                    "kind": "unverified_figure",
                    "values": verification.get("unverified_values", []),
                    "message": "Some figures in the response could not be verified against tool outputs.",
                },
            )

        limiter.record_usage(total_usage, model=model)
        yield _format_sse(
            "done",
            {
                "verified": verification.get("verified", True),
                "tools_used": [name for name, _, _ in tool_calls_made],
                "usage": total_usage,
            },
        )
    except Exception as exc:
        yield _format_sse("error", {"message": f"Gemini error: {exc}"})


async def _stream_anthropic_turns(
    client: Any,
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> AsyncIterator[str]:
    model = get_chat_model()
    effort = get_chat_effort()
    system_blocks = build_system_blocks()
    conversation = _prepare_messages(messages, region, locale)

    accumulated_text_parts: list[str] = []
    tool_results_for_guard: list[dict[str, Any]] = []
    total_usage = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }

    try:
        for turn in range(MAX_TOOL_TURNS):
            stream_ctx = _open_stream(
                client,
                tools=TOOLS,
                system=system_blocks,
                messages=conversation,
                model=model,
                max_tokens=MAX_TOKENS,
                tool_choice={"type": "auto"},
                output_config={"effort": effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
            async with stream_ctx as stream:
                async for text_delta in stream.text_stream:
                    if text_delta:
                        accumulated_text_parts.append(text_delta)
                        yield _format_sse("text", {"delta": text_delta})

                final_msg = await stream.get_final_message()

            turn_usage = _normalize_usage(getattr(final_msg, "usage", None))
            for k in total_usage:
                total_usage[k] += turn_usage[k]

            raw_content = getattr(final_msg, "content", []) or []
            assistant_blocks: list[dict[str, Any]] = []
            tool_calls: list[dict[str, Any]] = []

            for blk in raw_content:
                blk_type = getattr(blk, "type", None) or (blk.get("type") if isinstance(blk, dict) else None)
                if blk_type == "thinking":
                    thinking_val = getattr(blk, "thinking", None) or (blk.get("thinking") if isinstance(blk, dict) else "")
                    signature_val = getattr(blk, "signature", None) or (blk.get("signature") if isinstance(blk, dict) else "")
                    block_dict: dict[str, Any] = {"type": "thinking", "thinking": thinking_val}
                    if signature_val:
                        block_dict["signature"] = signature_val
                    assistant_blocks.append(block_dict)
                elif blk_type == "text":
                    text_val = getattr(blk, "text", None) or (blk.get("text") if isinstance(blk, dict) else "")
                    assistant_blocks.append({"type": "text", "text": text_val})
                elif blk_type == "tool_use":
                    tool_id = getattr(blk, "id", None) or (blk.get("id") if isinstance(blk, dict) else "")
                    tool_name = getattr(blk, "name", None) or (blk.get("name") if isinstance(blk, dict) else "")
                    tool_input = getattr(blk, "input", None) or (blk.get("input") if isinstance(blk, dict) else {})
                    tool_dict = {"type": "tool_use", "id": tool_id, "name": tool_name, "input": tool_input}
                    assistant_blocks.append(tool_dict)
                    tool_calls.append(tool_dict)

            conversation.append({"role": "assistant", "content": assistant_blocks})

            if not tool_calls or getattr(final_msg, "stop_reason", "") != "tool_use":
                break

            user_tool_results: list[dict[str, Any]] = []
            for tc in tool_calls:
                call_id = tc["id"]
                tool_name = tc["name"]
                tool_input = tc["input"]
                tool_label = TOOL_LABELS.get(tool_name, tool_name)
                yield _format_sse("tool", {"name": tool_name, "id": call_id, "label": tool_label, "input": tool_input})

                tool_result, is_err, chart_event = execute_tool(tool_name, tool_input)
                tool_results_for_guard.append(tool_result)

                if chart_event is not None and not is_err:
                    yield _format_sse("chart", chart_event)

                user_tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": call_id,
                        "content": json.dumps(tool_result, ensure_ascii=False),
                        "is_error": is_err,
                    }
                )

            conversation.append({"role": "user", "content": user_tool_results})

        final_text = "".join(accumulated_text_parts)
        verification = verify_figures(final_text, tool_results_for_guard)
        if not verification.get("verified", True):
            yield _format_sse(
                "notice",
                {
                    "kind": "unverified_figure",
                    "values": verification.get("unverified_values", []),
                    "message": "Some figures in the response could not be verified against tool outputs.",
                },
            )

        limiter.record_usage(total_usage, model=model)
        yield _format_sse(
            "done",
            {
                "verified": verification.get("verified", True),
                "tools_used": [t.get("name", "") for t in tool_results_for_guard if "name" in t],
                "usage": total_usage,
            },
        )
    except Exception as exc:
        yield _format_sse("error", {"message": f"Assistant error: {exc}"})


async def stream_chat_turns(
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> AsyncIterator[str]:
    client = _create_client()
    provider = get_chat_provider()
    # Check if client is custom/fake (e.g. tests)
    if hasattr(client, "beta") or hasattr(client, "messages"):
        async for chunk in _stream_anthropic_turns(client, messages, region, locale):
            yield chunk
    elif provider == "gemini":
        async for chunk in _stream_gemini_turns(client, messages, region, locale):
            yield chunk
    else:
        async for chunk in _stream_anthropic_turns(client, messages, region, locale):
            yield chunk


@router.post("/chat")
async def chat_endpoint(request: Request, payload: ChatRequest) -> StreamingResponse:
    enabled, disabled_msg = is_chat_enabled()
    if not enabled:
        raise HTTPException(status_code=503, detail=disabled_msg)

    client_ip = request.client.host if request.client else "unknown"
    rate_error = limiter.check_and_record_ip(client_ip)
    if rate_error:
        raise HTTPException(status_code=429, detail=rate_error)

    budget_error = limiter.check_budget()
    if budget_error:
        raise HTTPException(status_code=429, detail=budget_error)

    raw_messages = [m.model_dump() for m in payload.messages]

    validation_error = validate_chat_request(raw_messages)
    if validation_error:
        raise HTTPException(status_code=422, detail=validation_error)

    if payload.region and payload.region not in VALID_REGIONS:
        raise HTTPException(status_code=422, detail=f"Invalid region: {payload.region}")

    generator = stream_chat_turns(
        messages=raw_messages,
        region=payload.region,
        locale=payload.locale,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
