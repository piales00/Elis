import inspect
import json
import os
from typing import Any, AsyncIterator, Callable

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.chat_guard import limiter, validate_chat_request, verify_figures
from api.chat_prompt import build_system_blocks
from api.chat_tools import TOOL_LABELS, TOOLS, VALID_REGIONS, execute_tool


DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_EFFORT = "low"
MAX_TOKENS = 4000
MAX_TOOL_TURNS = 6
FALLBACK_BETA = "server-side-fallback-2026-07-01"

router = APIRouter()

_client_factory: Callable[[], Any] | None = None


def set_client_factory(factory: Callable[[], Any] | None) -> None:
    global _client_factory
    _client_factory = factory


def get_chat_model() -> str:
    return os.environ.get("CHAT_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def get_chat_effort() -> str:
    effort = os.environ.get("CHAT_EFFORT", DEFAULT_EFFORT).strip().lower()
    return effort if effort in ("low", "medium", "high") else DEFAULT_EFFORT


def is_chat_enabled() -> tuple[bool, str]:
    if os.environ.get("CHAT_ENABLED", "0").strip() != "1":
        return False, "The data assistant is currently disabled (CHAT_ENABLED is not set to 1)."
    if _client_factory is None and not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return False, "The data assistant is not configured (ANTHROPIC_API_KEY is missing)."
    return True, ""


def _create_client() -> Any:
    if _client_factory is not None:
        return _client_factory()
    from anthropic import AsyncAnthropic

    return AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


class ChatRequestPayload(BaseModel):
    messages: list[dict[str, Any]]
    region: str | None = "peru"
    locale: str | None = "en"


def format_sse(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def _prepare_messages(messages: list[dict[str, Any]], region: str | None, locale: str | None) -> list[dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    for msg in messages[:-1]:
        role = msg.get("role")
        content = msg.get("content")
        if role in ("user", "assistant") and isinstance(content, (str, list)):
            prepared.append({"role": role, "content": content})

    last = messages[-1]
    reg = region if region in VALID_REGIONS else "peru"
    loc = locale if locale in ("en", "es") else "en"
    context_suffix = f"\n\n[Screen context: region={reg}, locale={loc}]"
    user_text = str(last.get("content", "")).strip() + context_suffix
    prepared.append({"role": "user", "content": user_text})
    return prepared


def _extract_usage_dict(usage_obj: Any) -> dict[str, int]:
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
    raise RuntimeError("Anthropic client does not expose a compatible stream method.")


async def stream_chat_turns(
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> AsyncIterator[str]:
    client = _create_client()
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
                fallbacks="default",
                betas=[FALLBACK_BETA],
            )
            async with stream_ctx as stream:
                text_stream = getattr(stream, "text_stream", None)
                if text_stream is not None:
                    async for delta in text_stream:
                        if delta:
                            accumulated_text_parts.append(delta)
                            yield format_sse("text", {"delta": delta})
                final_message = await stream.get_final_message()

            turn_usage = _extract_usage_dict(getattr(final_message, "usage", None))
            for k in total_usage:
                total_usage[k] += turn_usage[k]
            limiter.record_usage(turn_usage, model=model)

            stop_reason = getattr(final_message, "stop_reason", None)
            content_blocks = list(getattr(final_message, "content", []) or [])

            if stop_reason == "refusal":
                refusal_msg = (
                    "I can only answer questions about FireChronos Peru's harmonized fire activity series "
                    "and methodology."
                )
                yield format_sse("text", {"delta": refusal_msg})
                yield format_sse("done", {"usage": total_usage})
                return

            if stop_reason == "max_tokens":
                incomplete_msg = "\n\n[Response truncated due to token limit.]"
                yield format_sse("text", {"delta": incomplete_msg})
                yield format_sse("done", {"usage": total_usage})
                return

            if stop_reason == "end_turn":
                full_text = "".join(accumulated_text_parts)
                guard_check = verify_figures(full_text, tool_results_for_guard)
                if not guard_check["verified"]:
                    yield format_sse(
                        "notice",
                        {
                            "kind": "unverified_figure",
                            "values": guard_check["unverified_values"],
                        },
                    )
                yield format_sse("done", {"usage": total_usage})
                return

            if stop_reason == "tool_use":
                conversation.append({"role": "assistant", "content": content_blocks})
                tool_result_blocks: list[dict[str, Any]] = []

                for block in content_blocks:
                    b_type = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
                    if b_type != "tool_use":
                        continue
                    t_id = block.get("id") if isinstance(block, dict) else getattr(block, "id", "")
                    t_name = block.get("name") if isinstance(block, dict) else getattr(block, "name", "")
                    t_input = block.get("input") if isinstance(block, dict) else getattr(block, "input", {})

                    label = TOOL_LABELS.get(t_name, f"Running {t_name}…")
                    yield format_sse("tool", {"name": t_name, "label": label})

                    res_dict, is_err, chart_event = execute_tool(t_name, t_input)
                    if not is_err:
                        tool_results_for_guard.append(res_dict)
                        if chart_event is not None:
                            tool_results_for_guard.append(chart_event)
                            yield format_sse("chart", chart_event)

                    tool_result_blocks.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": t_id,
                            "content": json.dumps(res_dict, ensure_ascii=False),
                            "is_error": is_err,
                        }
                    )

                conversation.append({"role": "user", "content": tool_result_blocks})
                if accumulated_text_parts and not accumulated_text_parts[-1].endswith((" ", "\n")):
                    accumulated_text_parts.append(" ")
                    yield format_sse("text", {"delta": " "})
                continue

            break

        cap_notice = "\n\n[Reached maximum tool-consultation turns; showing partial answer above.]"
        yield format_sse("text", {"delta": cap_notice})
        full_text = "".join(accumulated_text_parts)
        guard_check = verify_figures(full_text, tool_results_for_guard)
        if not guard_check["verified"]:
            yield format_sse(
                "notice",
                {
                    "kind": "unverified_figure",
                    "values": guard_check["unverified_values"],
                },
            )
        yield format_sse("done", {"usage": total_usage})

    except Exception as exc:
        yield format_sse(
            "error",
            {"message": f"Assistant error while processing your question: {exc}"},
        )


@router.post("/chat")
async def post_chat(payload: ChatRequestPayload, request: Request) -> StreamingResponse:
    enabled, reason = is_chat_enabled()
    if not enabled:
        raise HTTPException(status_code=503, detail=reason)

    budget_err = limiter.check_budget()
    if budget_err:
        raise HTTPException(status_code=503, detail=budget_err)

    validation_err = validate_chat_request(payload.messages)
    if validation_err:
        raise HTTPException(status_code=422, detail=validation_err)

    client_ip = request.client.host if request.client else "unknown"
    rate_err = limiter.check_and_record_ip(client_ip)
    if rate_err:
        raise HTTPException(status_code=429, detail=rate_err)

    return StreamingResponse(
        stream_chat_turns(payload.messages, payload.region, payload.locale),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
