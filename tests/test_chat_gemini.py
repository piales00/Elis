from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from api import chat
from api.chat_guard import limiter
from api.main import app


def response(text="Hello from Elis"):
    return SimpleNamespace(text=text, function_calls=[], usage_metadata=SimpleNamespace(prompt_token_count=100, candidates_token_count=20))


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "1")
    monkeypatch.setenv("CHAT_PROVIDER", "gemini")
    monkeypatch.setenv("CHAT_MODEL", "gemini-3.1-flash-lite")
    monkeypatch.setenv("CHAT_FALLBACK_MODEL", "gemini-3.5-flash-lite")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(chat.asyncio, "sleep", AsyncMock())
    models = SimpleNamespace(generate_content=AsyncMock(), generate_content_stream=AsyncMock())
    chat.set_client_factory(lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))
    limiter.reset()
    yield models
    chat.set_client_factory(None)
    limiter.reset()


def ask(locale="en"):
    with TestClient(app) as client:
        result = client.post("/chat", json={"messages": [{"role": "user", "content": "Hello"}], "locale": locale})
    assert result.status_code == 200
    return result.text


@pytest.mark.parametrize("failure", [RuntimeError("503 UNAVAILABLE secret JSON"), RuntimeError("429 RESOURCE_EXHAUSTED"), httpx.ReadTimeout("timeout"), SimpleNamespace])
def test_second_attempt_succeeds(gemini, failure):
    error = failure if isinstance(failure, Exception) else type("ServerError", (Exception,), {"code": 500})("server")
    gemini.generate_content.side_effect = [error, response()]
    body = ask()
    assert "event: done" in body
    assert "event: error" not in body
    assert gemini.generate_content.await_count == 2
    chat.asyncio.sleep.assert_awaited_once()


def test_fallback_model_and_usage(gemini, monkeypatch):
    record = Mock(wraps=limiter.record_usage)
    monkeypatch.setattr(limiter, "record_usage", record)
    gemini.generate_content.side_effect = [RuntimeError("UNAVAILABLE")] * 4 + [response()]
    assert "event: done" in ask()
    assert [call.kwargs["model"] for call in gemini.generate_content.await_args_list] == ["gemini-3.1-flash-lite"] * 4 + ["gemini-3.5-flash-lite"]
    assert record.call_args.kwargs["model"] == "gemini-3.5-flash-lite"
    assert record.call_args.args[0]["input_tokens"] == 100
    assert [call.args[0] for call in chat.asyncio.sleep.await_args_list] == pytest.approx([1, 2, 4], abs=0.3)


@pytest.mark.parametrize("locale, expected", [("en", "Elis is very busy"), ("es", "Elis está muy ocupada")])
def test_all_fail_friendly_error(gemini, locale, expected):
    gemini.generate_content.side_effect = RuntimeError("503 UNAVAILABLE {'secret': 'technical detail'}")
    body = ask(locale)
    assert expected in body
    assert "technical detail" not in body
    assert "UNAVAILABLE" not in body
    assert gemini.generate_content.await_count == 8
    assert "event: done" not in body


def test_no_retry_after_text(gemini):
    async def chunks():
        yield response("Partial answer")
        raise httpx.ReadTimeout("secret timeout")
    gemini.generate_content.return_value = response("")
    gemini.generate_content_stream.return_value = chunks()
    body = ask()
    assert "Partial answer" in body
    assert "event: error" in body
    assert gemini.generate_content.await_count == 1
    assert gemini.generate_content_stream.await_count == 1
    chat.asyncio.sleep.assert_not_awaited()



def test_stream_failure_before_text_can_retry(gemini, monkeypatch):
    record = Mock(wraps=limiter.record_usage)
    monkeypatch.setattr(limiter, "record_usage", record)

    async def chunks():
        raise httpx.ReadTimeout("before first text")
        yield

    gemini.generate_content.side_effect = [response(""), response()]
    gemini.generate_content_stream.return_value = chunks()
    body = ask()
    assert "event: done" in body
    assert body.count("event: text") == 1
    assert gemini.generate_content.await_count == 2
    assert sum(call.args[0]["input_tokens"] for call in record.call_args_list) == 200
