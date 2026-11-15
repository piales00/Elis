from api.chat_guard import (
    ChatUsageLimiter,
    MAX_MESSAGES_PER_REQUEST,
    MAX_QUESTION_CHARS,
    validate_chat_request,
    verify_figures,
)


def test_verify_figures_accepts_exact_and_rounded_values():
    tool_results = [
        {
            "unit": "fire cell-days",
            "rows": [
                {
                    "region": "amazonia",
                    "year": 2010,
                    "month": 8,
                    "estimated": 11622.1,
                    "est_low": 10894.6,
                    "est_high": 17164.8,
                }
            ],
            "validation": [
                {
                    "region": "peru",
                    "error_pct_method": 3.525056,
                    "error_pct_naive": 333.9036,
                    "mapbiomas_corr": 0.72419,
                }
            ],
        }
    ]
    text = (
        "In August 2010, Amazon activity reached at least 11,622 fire cell-days "
        "(90% range: 10,895 to 17,165 on the 0.1° / 11 km grid). "
        "Across Peru, the method error is 3.5% versus 333.9% naive, with a 72.4% (0.72) MapBiomas correlation."
    )
    res = verify_figures(text, tool_results)
    assert res["verified"] is True
    assert res["unverified_values"] == []


def test_verify_figures_detects_invented_number():
    tool_results = [
        {
            "rows": [
                {
                    "region": "sierra",
                    "year": 2020,
                    "month": 9,
                    "estimated": 3548.6,
                    "est_low": 3453.9,
                    "est_high": 3714.4,
                }
            ]
        }
    ]
    text = (
        "In September 2020, Sierra recorded at least 3,548.6 fire cell-days "
        "(90% range: 3,453.9 to 3,714.4), while an invented count was 48,912."
    )
    res = verify_figures(text, tool_results)
    assert res["verified"] is False
    assert "48,912" in res["unverified_values"]


def test_verify_figures_flags_numbers_when_no_tools_called():
    text = "In 2024 there were at least 19,432 fire cell-days in the Amazon."
    res = verify_figures(text, [])
    assert res["verified"] is False
    assert "19,432" in res["unverified_values"]


def test_rate_limiter_per_ip_and_daily_budget(monkeypatch):
    lim = ChatUsageLimiter()
    now = 1000.0
    for i in range(10):
        assert lim.check_and_record_ip("1.2.3.4", now=now + i) is None
    err_10m = lim.check_and_record_ip("1.2.3.4", now=now + 15)
    assert err_10m is not None and "10 minutes" in err_10m

    assert lim.check_and_record_ip("9.9.9.9", now=now + 15) is None

    monkeypatch.setenv("CHAT_DAILY_BUDGET_USD", "0.05")
    assert lim.check_budget() is None
    lim.record_usage({"input_tokens": 5000, "output_tokens": 2000}, model="claude-opus-5-5")
    budget_err = lim.check_budget()
    assert budget_err is not None and "daily assistant budget" in budget_err


def test_validate_chat_request_limits():
    assert validate_chat_request([]) is not None
    assert validate_chat_request([{"role": "assistant", "content": "hi"}]) is not None
    too_many = [{"role": "user", "content": "ok"} for _ in range(MAX_MESSAGES_PER_REQUEST + 1)]
    assert validate_chat_request(too_many) is not None
    too_long = [{"role": "user", "content": "x" * (MAX_QUESTION_CHARS + 1)}]
    assert validate_chat_request(too_long) is not None
    valid = [{"role": "user", "content": "Was 2024 a high fire year in the Amazon?"}]
    assert validate_chat_request(valid) is None
