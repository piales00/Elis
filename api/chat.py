import asyncio
import inspect
import json
import logging
import os
import random

import httpx
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

logger = logging.getLogger(__name__)

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
        return genai.Client(api_key=api_key, http_options={"timeout": 30000, "retry_options": {"attempts": 1}})
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

    queried_regions: list[str] = []
    for _, inp, _ in tool_calls_made:
        if isinstance(inp, dict):
            r = inp.get("region")
            if r in VALID_REGIONS and r not in queried_regions:
                queried_regions.append(r)
            for item in inp.get("regions") or []:
                if item in VALID_REGIONS and item not in queried_regions:
                    queried_regions.append(item)

    if len(queried_regions) >= 2:
        is_monthly = any(
            isinstance(inp, dict) and inp.get("aggregate") == "month" and inp.get("from_year") == inp.get("to_year")
            for _, inp, _ in tool_calls_made
        )
        sample_y = 2024
        for _, inp, _ in tool_calls_made:
            if isinstance(inp, dict) and inp.get("from_year"):
                sample_y = int(inp.get("to_year") or inp.get("from_year") or 2024)
                break
        chart_ev = execute_tool(
            "show_chart",
            {
                "chart": "multi_region",
                "region": queried_regions[0],
                "regions": queried_regions[:3],
                "from_year": sample_y if is_monthly else 2003,
                "to_year": sample_y if is_monthly else 2026,
                "highlight_year": sample_y,
            },
        )[2]
        if chart_ev:
            return chart_ev

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
        if name == "get_methodology" and isinstance(inp, dict) and inp.get("topic") == "forecast" and not any(n in ("get_series", "rank_years", "compare_periods") for n, _, _ in tool_calls_made):
            chart_ev = execute_tool(
                "show_chart",
                {
                    "chart": "forecast",
                    "region": reg,
                    "from_year": 2024,
                    "to_year": 2026,
                },
            )[2]
            if chart_ev:
                return chart_ev
    return None


_GREETING_TOKENS = {
    "hola",
    "hello",
    "hi",
    "hey",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "quien eres",
    "que eres",
    "que puedes hacer",
    "help",
    "ayuda",
}


def _is_greeting_only(text: str) -> bool:
    cleaned = "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in text)
    normalized = " ".join(cleaned.split())
    return normalized in _GREETING_TOKENS


_TARGET_PLACES = [
    (("madre de dios", "tambopata", "manu"), "Madre de Dios", "Madre de Dios", "amazonia", "madre_de_dios"),
    (("cusco", "cuzco", "machu picchu", "urubamba", "valle sagrado", "sacred valley"), "Cusco y Machu Picchu", "Cusco & Machu Picchu", "sierra", "cusco"),
    (("ucayali", "pucallpa"), "Ucayali", "Ucayali", "amazonia", "ucayali"),
    (("puno", "titicaca"), "Puno", "Puno", "sierra", "puno"),
    (("junin", "junín"), "Junín", "Junín", "sierra", "junin"),
    (("san martin", "san martín", "tarapoto"), "San Martín", "San Martín", "amazonia", "san_martin"),
    (("loreto", "iquitos"), "Loreto", "Loreto", "amazonia", "loreto"),
    (("ancash", "áncash", "huaraz"), "Áncash", "Áncash", "sierra", "sierra"),
    (("piura",), "Piura", "Piura", "costa", "costa"),
    (("cajamarca",), "Cajamarca", "Cajamarca", "sierra", "sierra"),
    (("apurimac", "apurímac"), "Apurímac", "Apurímac", "sierra", "sierra"),
    (("ayacucho",), "Ayacucho", "Ayacucho", "sierra", "sierra"),
    (("huanuco", "huánuco"), "Huánuco", "Huánuco", "sierra", "sierra"),
    (("pasco",), "Pasco", "Pasco", "sierra", "sierra"),
]


def _build_decision_suggestions(
    messages: list[dict[str, Any]],
    tool_calls_made: list[tuple[str, dict[str, Any], dict[str, Any]]],
    default_region: str | None,
    locale: str | None,
) -> list[dict[str, Any]]:
    raw_q = str(messages[-1].get("content", "")) if messages else ""
    q = raw_q.lower()
    is_es = (locale or "es").lower().startswith("es") or any(
        w in q for w in ("cual", "cuál", "como", "cómo", "que", "qué", "incendio", "fuego", "pronostico", "pronóstico", "hola")
    )

    macro = default_region if default_region in VALID_REGIONS else "peru"
    for _, inp, _ in tool_calls_made:
        if isinstance(inp, dict) and inp.get("region") in VALID_REGIONS:
            macro = inp["region"]

    region_labels_es = {"peru": "Perú", "amazonia": "la Amazonía", "sierra": "la Sierra (Andes)", "costa": "la Costa"}
    region_labels_en = {"peru": "Peru", "amazonia": "the Amazon", "sierra": "the Andes (Sierra)", "costa": "the Coast"}
    label_es = region_labels_es.get(macro, "Perú")
    label_en = region_labels_en.get(macro, "Peru")
    camera = macro

    for keywords, t_es, t_en, t_macro, t_cam in _TARGET_PLACES:
        if any(kw in q for kw in keywords):
            label_es = t_es
            label_en = t_en
            macro = t_macro
            camera = t_cam
            break

    target = label_es if is_es else label_en
    asked_forecast = any(w in q for w in ("pronostico", "pronóstico", "2027", "forecast", "outlook", "alerta temprana"))
    asked_continuity = any(
        w in q for w in ("continuity", "continuidad", "emulador", "emulator")
    )
    asked_sensors = any(w in q for w in ("sensor", "modis", "viirs", "2012", "desacuerdo", "chapman", "salto", "disagreement"))

    chips: list[dict[str, Any]] = []
    if not asked_forecast:
        chips.append({
            "id": "ChipForecast2027",
            "label": f"🔮 Pronóstico 2027: {target}" if is_es else f"🔮 2027 Outlook: {target}",
            "prompt": f"¿Cuál es el pronóstico estacional 2027, el rango al 90% y la clase de anomalía para {target}?" if is_es else f"What is the 2027 seasonal outlook, 90% range, and anomaly class for {target}?",
            "region": macro,
            "cameraKey": camera,
            "mode3d": True,
        })
    if not asked_continuity:
        chips.append({
            "id": "ChipContinuity",
            "label": f"🛡️ Continuidad tras MODIS ({target})" if is_es else f"🛡️ Continuity after MODIS ({target})",
            "prompt": f"¿Cómo mantiene el emulador la escala MODIS y cuáles son sus límites en {target}?" if is_es else f"How does the emulator maintain the MODIS scale and what are its limits in {target}?",
            "region": macro,
            "cameraKey": camera,
            "mode3d": True,
        })
    if not asked_sensors:
        chips.append({
            "id": "ChipSensorComparison",
            "label": "🛰️ Comparar MODIS y VIIRS" if is_es else "🛰️ Compare MODIS and VIIRS",
            "prompt": f"Compara MODIS y VIIRS para septiembre en {target}?" if is_es else f"Compare MODIS and VIIRS for September in {target}?",
            "region": macro,
            "cameraKey": camera,
            "mode3d": False,
        })
    chips.append({
        "id": "ChipComparePeaks",
        "label": "📊 Comparar 2024 vs. Récords Históricos" if is_es else "📊 Compare 2024 vs. Record Years",
        "prompt": f"Compara la actividad de fuego de 2024 frente a los años récord históricos desde 2003 en {target}." if is_es else f"Compare 2024 fire activity against the historical peak record years since 2003 in {target}.",
        "region": macro,
        "cameraKey": camera,
        "mode3d": False,
    })
    return chips[:3]


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
        raw_user_text = prepared[-1]["content"]
        if _is_greeting_only(raw_user_text):
            lang_hint = locale or "es"
            prepared[-1]["content"] = (
                f"{raw_user_text}\n\n[Context: user locale: {lang_hint}. "
                "This is a conversational greeting. Do NOT call any tools; reply warmly in 2 short sentences as Elis and suggest the challenge topics from the system prompt.]"
            )
            return prepared
        extra: list[str] = []
        if region:
            extra.append(f"default screen region if user omits region: {region}")
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
            v_type = v.get("type")
            if v_type == "integer":
                prop_type = types.Type.INTEGER
            elif v_type == "number":
                prop_type = types.Type.NUMBER
            elif v_type == "boolean":
                prop_type = types.Type.BOOLEAN
            elif v_type == "array" or (isinstance(v_type, list) and "array" in v_type):
                item_enum = v.get("items", {}).get("enum")
                schema_props[k] = types.Schema(
                    type=types.Type.ARRAY,
                    description=v.get("description"),
                    items=types.Schema(type=types.Type.STRING, enum=item_enum),
                )
                continue
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


def _retryable_gemini_error(exc: Exception) -> bool:
    code = (
        getattr(exc, "code", None)
        or getattr(exc, "status_code", None)
        or getattr(getattr(exc, "response", None), "status_code", None)
    )
    return (
        str(code) in {"429", "500", "503"}
        or isinstance(exc, (TimeoutError, ConnectionError, httpx.TransportError))
        or any(status in str(exc).upper() for status in ("UNAVAILABLE", "RESOURCE_EXHAUSTED"))
    )


async def _stream_gemini_turns(
    client: Any,
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> AsyncIterator[str]:
    primary = get_chat_model()
    fallback = os.environ.get("CHAT_FALLBACK_MODEL", "gemini-3.5-flash-lite").strip()
    models = list(dict.fromkeys(model for model in (primary, fallback) if model))
    emitted_text = False
    for model in models:
        for attempt in range(4):
            pending = []
            try:
                async for event in _stream_gemini_attempt(client, messages, region, locale, model):
                    if event.startswith("event: text\n"):
                        emitted_text = True
                    if emitted_text or event.startswith("event: done\n"):
                        for buffered in pending:
                            yield buffered
                        pending.clear()
                        yield event
                    else:
                        pending.append(event)
                return
            except Exception as exc:
                logger.exception("Gemini request failed: model=%s attempt=%s", model, attempt + 1)
                if emitted_text or not _retryable_gemini_error(exc):
                    break
                if attempt < 3:
                    await asyncio.sleep(2 ** attempt + random.uniform(0, 0.3))
        if emitted_text:
            break
    yield _format_sse("error", {"message": _busy_message(locale)})


def _busy_message(locale: str | None) -> str:
    return (
        "Elis está muy ocupada ahora. Aquí tienes respuestas verificadas que puedes abrir al instante."
        if (locale or "en").lower().startswith("es") else
        "Elis is very busy right now. Here are verified answers you can open instantly."
    )


async def _stream_gemini_attempt(
    client: Any,
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
    model: str,
) -> AsyncIterator[str]:
    from google.genai import types

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

    async def synthesis_stream(config_synthesis):
        usage = None
        try:
            async for chunk in await client.aio.models.generate_content_stream(
                model=model, contents=contents, config=config_synthesis,
            ):
                usage = getattr(chunk, "usage_metadata", None) or usage
                yield chunk
        finally:
            if usage:
                total_usage["input_tokens"] += int(getattr(usage, "prompt_token_count", 0) or 0)
                total_usage["output_tokens"] += int(getattr(usage, "candidates_token_count", 0) or 0)

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
                if resp.text:
                    accumulated_text_parts.append(resp.text)
                    yield _format_sse("text", {"delta": resp.text})
                else:
                    config_synthesis = types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT_TEXT,
                        thinking_config=types.ThinkingConfig(thinking_budget=0),
                        temperature=0.2,
                    )
                    async for chunk in synthesis_stream(config_synthesis):
                        chunk_text = chunk.text or ""
                        if chunk_text:
                            accumulated_text_parts.append(chunk_text)
                            yield _format_sse("text", {"delta": chunk_text})
                break

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

        if not accumulated_text_parts:
            config_synthesis = types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT_TEXT,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
                temperature=0.2,
            )
            async for chunk in synthesis_stream(config_synthesis):
                chunk_text = chunk.text or ""
                if chunk_text:
                    accumulated_text_parts.append(chunk_text)
                    yield _format_sse("text", {"delta": chunk_text})

        final_text = "".join(accumulated_text_parts)
        is_greeting = bool(messages and _is_greeting_only(str(messages[-1].get("content", ""))))
        verification = verify_figures(final_text, tool_results_for_guard)
        if not is_greeting and not verification.get("verified", True):
            yield _format_sse(
                "notice",
                {
                    "kind": "unverified_figure",
                    "values": verification.get("unverified_values", []),
                    "message": "Some figures in the response could not be verified against tool outputs.",
                },
            )

        yield _format_sse(
            "done",
            {
                "verified": verification.get("verified", True),
                "tools_used": [name for name, _, _ in tool_calls_made],
                "usage": total_usage,
                "suggestions": _build_decision_suggestions(messages, [], region, locale),
            },
        )
    finally:
        limiter.record_usage(total_usage, model=model)


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
                "suggestions": _build_decision_suggestions(messages, [], region, locale),
            },
        )
    except Exception as exc:
        yield _format_sse("error", {"message": f"Assistant error: {exc}"})


async def stream_chat_turns(
    messages: list[dict[str, Any]],
    region: str | None,
    locale: str | None,
) -> AsyncIterator[str]:
    try:
        client = _create_client()
    except Exception:
        logger.exception("Assistant client initialization failed")
        yield _format_sse("error", {"message": _busy_message(locale)})
        return
    provider = get_chat_provider()
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
