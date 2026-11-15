import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.chat import set_client_factory
from api.chat_guard import limiter
from api.main import app


def parse_sse_events(raw_body: str) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    for chunk in raw_body.strip().split("\n\n"):
        if not chunk.strip():
            continue
        event_name = "message"
        data_obj: dict[str, Any] = {}
        for line in chunk.splitlines():
            if line.startswith("event:"):
                event_name = line[len("event:"):].strip()
            elif line.startswith("data:"):
                data_obj = json.loads(line[len("data:"):].strip())
        events.append((event_name, data_obj))
    return events


class FakeFinalMessage:
    def __init__(self, stop_reason: str, content: list[dict[str, Any]], usage: dict[str, int]) -> None:
        self.stop_reason = stop_reason
        self.content = content
        self.usage = usage


class FakeStreamContext:
    def __init__(self, deltas: list[str], final_message: FakeFinalMessage) -> None:
        self._deltas = deltas
        self._final = final_message

    async def __aenter__(self) -> "FakeStreamContext":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        return None

    @property
    async def text_stream(self):
        for delta in self._deltas:
            yield delta

    async def get_final_message(self) -> FakeFinalMessage:
        return self._final


class FakeBetaMessages:
    def __init__(self, scripted_turns: list[tuple[list[str], FakeFinalMessage]]) -> None:
        self.scripted_turns = list(scripted_turns)
        self.calls: list[dict[str, Any]] = []

    def stream(self, **kwargs: Any) -> FakeStreamContext:
        self.calls.append(kwargs)
        deltas, final_msg = self.scripted_turns.pop(0)
        return FakeStreamContext(deltas, final_msg)


class FakeAnthropicClient:
    def __init__(self, scripted_turns: list[tuple[list[str], FakeFinalMessage]]) -> None:
        self.beta = type("BetaNamespace", (), {"messages": FakeBetaMessages(scripted_turns)})()


@pytest.fixture(autouse=True)
def reset_chat_state():
    limiter.reset()
    set_client_factory(None)
    yield
    limiter.reset()
    set_client_factory(None)


@pytest.fixture
def client():
    return TestClient(app)


def test_chat_disabled_returns_503_and_rest_of_app_works(client, monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "0")
    res = client.post("/chat", json={"messages": [{"role": "user", "content": "Hello"}]})
    assert res.status_code == 503
    assert "disabled" in res.json()["detail"].lower()

    regions_res = client.get("/regions")
    assert regions_res.status_code == 200


def test_cors_allows_post_only_on_chat(client):
    chat_preflight = client.options(
        "/chat",
        headers={"Origin": "https://example.org", "Access-Control-Request-Method": "POST"},
    )
    assert chat_preflight.status_code == 200
    assert chat_preflight.headers["access-control-allow-origin"] == "*"

    series_post_preflight = client.options(
        "/series",
        headers={"Origin": "https://example.org", "Access-Control-Request-Method": "POST"},
    )
    assert series_post_preflight.status_code == 400


def test_chat_sse_tool_loop_chart_and_verified_text(client, monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "1")
    turn_1 = (
        [],
        FakeFinalMessage(
            stop_reason="tool_use",
            content=[
                {"type": "thinking", "thinking": "Checking Sierra September 2020."},
                {
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "get_series",
                    "input": {
                        "region": "sierra",
                        "from_year": 2020,
                        "to_year": 2020,
                        "aggregate": "month",
                    },
                },
                {
                    "type": "tool_use",
                    "id": "toolu_2",
                    "name": "show_chart",
                    "input": {
                        "chart": "year_vs_history",
                        "region": "sierra",
                        "from_year": 2020,
                        "to_year": 2020,
                        "highlight_year": 2020,
                    },
                },
            ],
            usage={"input_tokens": 900, "output_tokens": 80, "cache_creation_input_tokens": 850, "cache_read_input_tokens": 0},
        ),
    )
    turn_2 = (
        [
            "In September 2020, Sierra recorded at least 3,548.6 fire cell-days ",
            "(90% range: 3,453.9 to 3,714.4), compared with the historical median of 4,595.6.",
        ],
        FakeFinalMessage(
            stop_reason="end_turn",
            content=[
                {
                    "type": "text",
                    "text": (
                        "In September 2020, Sierra recorded at least 3,548.6 fire cell-days "
                        "(90% range: 3,453.9 to 3,714.4), compared with the historical median of 4,595.6."
                    ),
                }
            ],
            usage={"input_tokens": 1200, "output_tokens": 45, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 850},
        ),
    )
    fake_client = FakeAnthropicClient([turn_1, turn_2])
    set_client_factory(lambda: fake_client)

    response = client.post(
        "/chat",
        json={
            "messages": [{"role": "user", "content": "How much fire activity in Sierra in September 2020?"}],
            "region": "sierra",
            "locale": "en",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = parse_sse_events(response.text)
    event_names = [e[0] for e in events]
    assert event_names == ["tool", "tool", "chart", "text", "text", "done"]
    assert "notice" not in event_names

    chart_data = next(data for name, data in events if name == "chart")
    assert chart_data["chart"] == "year_vs_history"
    assert chart_data["unit"] == "fire cell-days"
    assert len(chart_data["series"]) == 12

    done_data = next(data for name, data in events if name == "done")
    assert done_data["usage"]["cache_read_input_tokens"] == 850

    second_call_messages = fake_client.beta.messages.calls[1]["messages"]
    assistant_msg = second_call_messages[1]
    assert assistant_msg["role"] == "assistant"
    assert assistant_msg["content"][0]["type"] == "thinking"
    user_tool_result_msg = second_call_messages[2]
    assert user_tool_result_msg["role"] == "user"
    assert len(user_tool_result_msg["content"]) == 2
    assert all(b["type"] == "tool_result" for b in user_tool_result_msg["content"])


def test_chat_emits_notice_on_unverified_figure(client, monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "1")
    turn_1 = (
        ["In 2024 there were 77,777 fire cell-days in the Amazon."],
        FakeFinalMessage(
            stop_reason="end_turn",
            content=[{"type": "text", "text": "In 2024 there were 77,777 fire cell-days in the Amazon."}],
            usage={"input_tokens": 800, "output_tokens": 20, "cache_read_input_tokens": 750, "cache_creation_input_tokens": 0},
        ),
    )
    set_client_factory(lambda: FakeAnthropicClient([turn_1]))

    response = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "How was 2024?"}], "region": "amazonia", "locale": "en"},
    )
    assert response.status_code == 200
    events = parse_sse_events(response.text)
    notice = next((data for name, data in events if name == "notice"), None)
    assert notice is not None
    assert notice["kind"] == "unverified_figure"
    assert "77,777" in notice["values"]


def test_chat_validation_and_rate_limits(client, monkeypatch):
    monkeypatch.setenv("CHAT_ENABLED", "1")
    set_client_factory(lambda: FakeAnthropicClient([]))

    bad_res = client.post("/chat", json={"messages": [{"role": "user", "content": "x" * 605}]})
    assert bad_res.status_code == 422

    for _ in range(10):
        limiter.check_and_record_ip("testclient")
    rate_res = client.post("/chat", json={"messages": [{"role": "user", "content": "Valid question?"}]})
    assert rate_res.status_code == 429


def test_evals_chat_questions_jsonl_is_valid():
    from pathlib import Path
    from api.chat_tools import TOOLS, VALID_REGIONS

    evals_path = Path(__file__).resolve().parent.parent / "evals" / "chat_questions.jsonl"
    assert evals_path.exists()
    lines = [line.strip() for line in evals_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 25
    valid_tools = {t["name"] for t in TOOLS}
    for line in lines:
        item = json.loads(line)
        assert "id" in item and "question" in item and "region" in item
        assert item["region"] in VALID_REGIONS
        for tool_name in item["expected_tools"]:
            assert tool_name in valid_tools

