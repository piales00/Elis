import json
from pathlib import Path

import pytest

from api.chat_tools import (
    PROCESSED_DIR,
    TOOLS,
    UNIT,
    VALID_REGIONS,
    execute_tool,
)


@pytest.fixture(scope="module")
def raw_series():
    return json.loads((PROCESSED_DIR / "series.json").read_text(encoding="utf-8"))


def test_tool_schemas_are_strict_and_complete():
    expected_names = ["get_series", "compare_periods", "rank_years", "get_methodology", "show_chart"]
    assert [t["name"] for t in TOOLS] == expected_names
    for tool in TOOLS:
        assert tool.get("strict") is True
        schema = tool["input_schema"]
        assert schema["type"] == "object"
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == set(schema["properties"].keys())
        if "region" in schema["properties"]:
            assert schema["properties"]["region"]["enum"] == list(VALID_REGIONS)


def test_get_series_monthly_matches_series_json(raw_series):
    res, is_err, chart = execute_tool(
        "get_series",
        {"region": "sierra", "from_year": 2020, "to_year": 2020, "aggregate": "month"},
    )
    assert not is_err
    assert chart is None
    assert res["unit"] == UNIT
    rows = res["rows"]
    assert len(rows) == 12
    sep = next(r for r in rows if r["month"] == 9)
    expected_sep = next(
        r for r in raw_series if r["region"] == "sierra" and r["year"] == 2020 and r["month"] == 9
    )
    assert sep["estimated"] == expected_sep["estimated"]
    assert sep["est_low"] == expected_sep["est_low"]
    assert sep["est_high"] == expected_sep["est_high"]
    assert sep["anomaly_class"] == expected_sep["anomaly_class"]


def test_get_series_annual_totals_match_monthly_sum(raw_series):
    res, is_err, _ = execute_tool(
        "get_series",
        {"region": "amazonia", "from_year": 2003, "to_year": 2026, "aggregate": "year"},
    )
    assert not is_err
    assert res["unit"] == UNIT
    for row in res["rows"]:
        year = row["year"]
        monthly = [
            r for r in raw_series
            if r["region"] == "amazonia" and r["year"] == year and not r.get("is_forecast")
        ]
        assert row["estimated"] == pytest.approx(sum(r["estimated"] for r in monthly), abs=0.2)
        assert row["raw_detections"] == sum(r["raw_detections"] for r in monthly)
        if row["est_low"] is None:
            assert "range_note" in res

    row_2026 = next(r for r in res["rows"] if r["year"] == 2026)
    assert row_2026["partial"] is True
    assert row_2026["provisional"] is True
    assert row_2026["partial_through"] == "2026-11-13"
    assert res.get("forecast_rows") and res["forecast_rows"][0]["is_forecast"] is True


def test_get_series_low_confidence_before_2003():
    res, is_err, _ = execute_tool(
        "get_series",
        {"region": "peru", "from_year": 2000, "to_year": 2002, "aggregate": "year"},
    )
    assert not is_err
    for row in res["rows"]:
        assert row["low_confidence"] is True
        assert row["confidence"] == "low"
    row_2000 = next(r for r in res["rows"] if r["year"] == 2000)
    assert row_2000["partial"] is True
    assert row_2000["months_included"] == [11, 12]


def test_compare_periods_years_and_partial_2026():
    res, is_err, _ = execute_tool(
        "compare_periods",
        {"region": "peru", "period_a": "2024", "period_b": "2020"},
    )
    assert not is_err
    assert res["unit"] == UNIT
    est_a = res["period_a"]["estimated"]
    est_b = res["period_b"]["estimated"]
    assert res["difference"] == pytest.approx(est_a - est_b, abs=0.2)
    assert res["pct_difference_a_vs_b"] == pytest.approx(((est_a - est_b) / est_b) * 100.0, abs=0.2)

    res_2026, is_err_2026, _ = execute_tool(
        "compare_periods",
        {"region": "amazonia", "period_a": "2026", "period_b": "2024"},
    )
    assert not is_err_2026
    assert res_2026["period_a"]["partial"] is True
    assert "partial_year_warning" in res_2026
    assert "same_complete_months_comparison" in res_2026
    same_win = res_2026["same_complete_months_comparison"]
    assert same_win["window"] == "Jan-Oct (months 1..10)"


def test_rank_years_excludes_partial_and_identifies_drought_years():
    res, is_err, _ = execute_tool(
        "rank_years",
        {"region": "amazonia", "metric": "estimated", "top": 5, "from_year": 2000, "to_year": 2026},
    )
    assert not is_err
    assert res["unit"] == UNIT
    ranked_years = [r["year"] for r in res["rankings"]]
    assert 2000 not in ranked_years
    assert 2026 not in ranked_years
    excluded_years = {r["year"] for r in res.get("excluded_partial_years", [])}
    assert {2000, 2026} <= excluded_years
    assert 2005 in ranked_years or 2010 in ranked_years
    top_month_years = {(m["year"], m["month"]) for m in res["top_single_months"]}
    assert (2010, 8) in top_month_years or (2005, 8) in top_month_years


@pytest.mark.parametrize(
    "topic",
    ["validation", "detection", "emulator", "forecast", "findings", "periods", "limits"],
)
def test_get_methodology_topics(topic):
    res, is_err, _ = execute_tool("get_methodology", {"topic": topic})
    assert not is_err
    assert res["unit"] == UNIT
    assert res["topic"] == topic


@pytest.mark.parametrize(
    "chart_type",
    ["series", "raw_vs_corrected", "year_vs_history", "forecast", "multi_region"],
)
def test_show_chart_builds_chart_event(chart_type):
    res, is_err, chart_event = execute_tool(
        "show_chart",
        {
            "chart": chart_type,
            "region": "amazonia",
            "from_year": 2003,
            "to_year": 2026,
            "highlight_year": 2024,
        },
    )
    assert not is_err
    assert res["status"] == "chart_queued"
    assert chart_event is not None
    assert chart_event["chart"] == chart_type
    assert chart_event["unit"] == UNIT
    assert len(chart_event["series"]) > 0


def test_show_chart_multi_region_with_explicit_regions():
    res, is_err, chart_event = execute_tool(
        "show_chart",
        {
            "chart": "multi_region",
            "region": "amazonia",
            "regions": ["amazonia", "sierra"],
            "from_year": 2003,
            "to_year": 2026,
            "highlight_year": 2024,
        },
    )
    assert not is_err
    assert chart_event["chart"] == "multi_region"
    assert "series_by_region" in chart_event
    assert "amazonia" in chart_event["series_by_region"]
    assert "sierra" in chart_event["series_by_region"]
    assert len(chart_event["series_by_region"]["amazonia"]) > 0
    assert len(chart_event["series_by_region"]["sierra"]) > 0



@pytest.mark.parametrize(
    "name, bad_input",
    [
        ("get_series", {"region": "lima", "from_year": 2020, "to_year": 2024, "aggregate": "year"}),
        ("get_series", {"region": "peru", "from_year": 2025, "to_year": 2020, "aggregate": "year"}),
        ("get_series", {"region": "peru", "from_year": 1998, "to_year": 2020, "aggregate": "year"}),
        ("get_series", {"region": "peru", "from_year": 2000, "to_year": 2025, "aggregate": "month"}),
        ("compare_periods", {"region": "peru", "period_a": "2024", "period_b": "2024-09"}),
        ("compare_periods", {"region": "cusco", "period_a": "2024", "period_b": "2020"}),
        ("rank_years", {"region": "peru", "metric": "invalid", "top": 5, "from_year": 2003, "to_year": 2025}),
        ("get_methodology", {"topic": "unknown_topic"}),
        ("unknown_tool", {}),
    ],
)
def test_tool_errors_return_is_error_true(name, bad_input):
    res, is_err, chart_event = execute_tool(name, bad_input)
    assert is_err is True
    assert "error" in res
    assert chart_event is None
