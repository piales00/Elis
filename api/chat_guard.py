from collections import deque
from datetime import datetime, timezone
import math
import os
import re
import time
from typing import Any


MAX_MESSAGES_PER_REQUEST = 12
MAX_QUESTION_CHARS = 600
RATE_LIMIT_10M = 10
RATE_LIMIT_WINDOW_10M = 600.0
RATE_LIMIT_DAY = 40
RATE_LIMIT_WINDOW_DAY = 86400.0
DEFAULT_DAILY_BUDGET_USD = 5.0

MODEL_PRICING_PER_MTOK: dict[str, dict[str, float]] = {
    "claude-opus-5-5": {
        "input": 4.0,
        "output": 20.0,
        "cache_read": 0.20,
        "cache_write": 5.0,
    },
    "claude-sonnet-5-5": {
        "input": 2.0,
        "output": 10.0,
        "cache_read": 0.10,
        "cache_write": 2.50,
    },
}

CONTRACT_CONSTANTS = {
    0.0,
    0.1,
    0.5,
    1.0,
    2.0,
    3.0,
    4.0,
    5.0,
    9.0,
    10.0,
    11.0,
    12.0,
    20.0,
    21.0,
    25.0,
    26.0,
    27.0,
    30.0,
    50.0,
    75.0,
    80.0,
    90.0,
    95.0,
    100.0,
    375.0,
}

ISO_DATE_RE = re.compile(r"\b(?:19|20)\d{2}-\d{1,2}(?:-\d{1,2})?\b")
TIME_OF_DAY_RE = re.compile(r"\b\d{1,2}:\d{2}\b")
SATELLITE_NAME_RE = re.compile(r"\b(?:NOAA|GOES|Landsat)[-\s]?\d+\b", re.IGNORECASE)
NUMBER_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_])[-−]?\d[\d,]*(?:\.\d+)?(?![A-Za-z0-9_])")


def _extract_numbers_from_value(value: Any, out: set[float]) -> None:
    if isinstance(value, bool) or value is None:
        return
    if isinstance(value, (int, float)):
        fval = float(value)
        if math.isfinite(fval):
            out.add(fval)
            out.add(abs(fval))
            if 0.0 < abs(fval) <= 1.0:
                out.add(fval * 100.0)
                out.add(abs(fval) * 100.0)
        return
    if isinstance(value, dict):
        for k, v in value.items():
            if k in ("error", "is_error"):
                continue
            _extract_numbers_from_value(v, out)
        return
    if isinstance(value, (list, tuple, set)):
        for item in value:
            _extract_numbers_from_value(item, out)


def collect_allowed_numbers(tool_results: list[dict[str, Any]]) -> set[float]:
    allowed: set[float] = set()
    for res in tool_results:
        _extract_numbers_from_value(res, allowed)
    return allowed


def _is_year_token(val: float, raw_token: str) -> bool:
    if "." in raw_token or "," in raw_token:
        return False
    ival = int(val)
    return 1990 <= ival <= 2027 and float(ival) == val


def _matches_any_allowed(candidate: float, allowed: set[float]) -> bool:
    for ref in allowed:
        if math.isclose(candidate, ref, rel_tol=0.008, abs_tol=0.05):
            return True
        if abs(candidate - round(ref)) <= 1e-9:
            return True
        for digits in (0, 1, 2, 3):
            if round(candidate, digits) == round(ref, digits):
                return True
        if abs(ref) >= 10.0 and abs(candidate - ref) <= 1.0:
            return True
    return False


def verify_figures(text: str, tool_results: list[dict[str, Any]]) -> dict[str, Any]:
    cleaned = ISO_DATE_RE.sub(" ", text)
    cleaned = TIME_OF_DAY_RE.sub(" ", cleaned)
    cleaned = SATELLITE_NAME_RE.sub(" ", cleaned)

    allowed = collect_allowed_numbers(tool_results)
    checked: list[str] = []
    unverified: list[str] = []

    for match in NUMBER_TOKEN_RE.finditer(cleaned):
        raw_token = match.group(0)
        normalized = raw_token.replace("−", "-").replace(",", "")
        try:
            val = float(normalized)
        except ValueError:
            continue
        if _is_year_token(val, raw_token):
            continue
        if abs(val) in CONTRACT_CONSTANTS and (allowed or abs(val) in {0.1, 1.0, 11.0, 20.0, 21.0, 26.0, 30.0, 90.0, 375.0}):
            continue
        checked.append(raw_token)
        if not _matches_any_allowed(val, allowed) and not _matches_any_allowed(abs(val), allowed):
            if raw_token not in unverified:
                unverified.append(raw_token)

    return {
        "verified": len(unverified) == 0,
        "checked_count": len(checked),
        "unverified_values": unverified,
    }


def compute_usage_cost_usd(usage: dict[str, Any], model: str = "claude-opus-5-5") -> float:
    pricing = MODEL_PRICING_PER_MTOK.get(model, MODEL_PRICING_PER_MTOK["claude-opus-5-5"])
    input_tokens = float(usage.get("input_tokens", 0) or 0)
    output_tokens = float(usage.get("output_tokens", 0) or 0)
    cache_read_tokens = float(usage.get("cache_read_input_tokens", 0) or 0)
    cache_write_tokens = float(usage.get("cache_creation_input_tokens", 0) or 0)

    return (
        (input_tokens / 1_000_000.0) * pricing["input"]
        + (output_tokens / 1_000_000.0) * pricing["output"]
        + (cache_read_tokens / 1_000_000.0) * pricing["cache_read"]
        + (cache_write_tokens / 1_000_000.0) * pricing["cache_write"]
    )


class ChatUsageLimiter:
    def __init__(self) -> None:
        self._ip_hits_10m: dict[str, deque[float]] = {}
        self._ip_hits_day: dict[str, deque[float]] = {}
        self._spend_day_key: str = self._today_key()
        self._spend_usd_today: float = 0.0

    @staticmethod
    def _today_key() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def reset(self) -> None:
        self._ip_hits_10m.clear()
        self._ip_hits_day.clear()
        self._spend_day_key = self._today_key()
        self._spend_usd_today = 0.0

    def _prune(self, bucket: deque[float], now: float, window: float) -> None:
        while bucket and (now - bucket[0]) > window:
            bucket.popleft()

    def check_and_record_ip(self, ip: str, now: float | None = None) -> str | None:
        ts = time.monotonic() if now is None else now
        q10 = self._ip_hits_10m.setdefault(ip, deque())
        qday = self._ip_hits_day.setdefault(ip, deque())

        self._prune(q10, ts, RATE_LIMIT_WINDOW_10M)
        self._prune(qday, ts, RATE_LIMIT_WINDOW_DAY)

        if len(q10) >= RATE_LIMIT_10M:
            return f"Rate limit exceeded: at most {RATE_LIMIT_10M} questions per 10 minutes."
        if len(qday) >= RATE_LIMIT_DAY:
            return f"Daily rate limit exceeded: at most {RATE_LIMIT_DAY} questions per day."

        q10.append(ts)
        qday.append(ts)
        return None

    def get_daily_budget_usd(self) -> float:
        raw = os.environ.get("CHAT_DAILY_BUDGET_USD", str(DEFAULT_DAILY_BUDGET_USD))
        try:
            return max(0.0, float(raw))
        except ValueError:
            return DEFAULT_DAILY_BUDGET_USD

    def check_budget(self) -> str | None:
        today = self._today_key()
        if today != self._spend_day_key:
            self._spend_day_key = today
            self._spend_usd_today = 0.0
        budget = self.get_daily_budget_usd()
        if self._spend_usd_today >= budget:
            return "The daily assistant budget has been reached. Use the preset questions or explore the interactive charts."
        return None

    def record_usage(self, usage: dict[str, Any], model: str = "claude-opus-5-5") -> float:
        today = self._today_key()
        if today != self._spend_day_key:
            self._spend_day_key = today
            self._spend_usd_today = 0.0
        cost = compute_usage_cost_usd(usage, model=model)
        self._spend_usd_today += cost
        return cost

    @property
    def spend_usd_today(self) -> float:
        return self._spend_usd_today


def validate_chat_request(messages: Any) -> str | None:
    if not isinstance(messages, list) or not messages:
        return "messages must be a non-empty list."
    if len(messages) > MAX_MESSAGES_PER_REQUEST:
        return f"Conversation history cannot exceed {MAX_MESSAGES_PER_REQUEST} messages."
    last = messages[-1]
    if not isinstance(last, dict) or last.get("role") != "user":
        return "The last message must have role 'user'."
    content = last.get("content")
    if not isinstance(content, str) or not content.strip():
        return "The user question cannot be empty."
    if len(content) > MAX_QUESTION_CHARS:
        return f"Question exceeds maximum length of {MAX_QUESTION_CHARS} characters."
    return None


limiter = ChatUsageLimiter()
