import json
from pathlib import Path
from typing import Any

import duckdb
import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
INTERIM_DIR = PROJECT_ROOT / "data" / "interim"

UNIT = "fire cell-days"
VALID_REGIONS = ("peru", "amazonia", "sierra", "costa")
REGION_LABELS = {
    "peru": "Peru",
    "amazonia": "Amazon",
    "sierra": "Andes (Sierra)",
    "costa": "Coast",
}
SEASON_MONTHS = (8, 9, 10)
HISTORY_YEARS = (2003, 2025)
MIN_YEAR = 2000
MAX_YEAR = 2026
ANOMALY_PERCENTILES = (25, 75, 90)
CI_TAILS = (0.05, 0.95)
MAX_MONTHLY_ROWS = 48

DECISION_PROFILES: dict[str, dict[str, Any]] = {
    "amazonia": {
        "sensor_pattern": "High MODIS-VIIRS agreement on continuous canopy fire fronts (in September VIIRS captures 84.9% of fire cell-days vs 21.5% for MODIS Aqua; multi-pixel deforestation fronts trigger both sensors).",
        "fire_regime": "Continuous forest-frontier canopy and land-clearing fires (Tambopata, Manu, Ucayali, and Loreto corridors).",
        "intervention_matrix": "INDECI/SERFOR T-60d aerial interdiction, SERNANP protected-area buffer patrols, and FEMA environmental prosecution in May-June (60 days before the Aug-Oct peak).",
        "preventive_lead_days": 60,
    },
    "sierra": {
        "sensor_pattern": "High sensor disagreement (VIIRS detects 4.1x more activity than MODIS because single-spot fragmented pasture burns have ~7% MODIS recall).",
        "fire_regime": "Fragmented high-altitude agricultural and pasture burns (pajonal/ichu) in Andean valleys including Cusco, Sacred Valley, and Machu Picchu buffer zones.",
        "intervention_matrix": "MIDAGRI/GORE community agricultural burn calendars and SERNANP perimeter firebreaks rather than costly aerial water-bombing; T-60d pre-positioning in May-June.",
        "preventive_lead_days": 60,
    },
    "costa": {
        "sensor_pattern": "Localized agro-industrial residue burns and seasonal dry-forest anomalies captured primarily by VIIRS 375 m.",
        "fire_regime": "Agro-industrial stubble burns and northern dry-forest fire events.",
        "intervention_matrix": "MIDAGRI/OEFA agricultural residue regulation and regional COER early alerts 60 days ahead of the dry season.",
        "preventive_lead_days": 60,
    },
    "peru": {
        "sensor_pattern": "National composite combining Amazonian canopy fronts and Andean fragmented pasture burns (true Chapman trend +0.18%/yr vs +16.77%/yr naive raw artifact).",
        "fire_regime": "Dual national regime: Amazonian deforestation fronts + Andean agricultural pasture burns.",
        "intervention_matrix": "MINAM Paris Agreement (NDC) bias-corrected carbon inventory + INDECI/SERFOR T-60d differentiated logistics across 25 departments.",
        "preventive_lead_days": 60,
    },
}

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_series",
        "description": (
            "Read harmonized fire activity time series in fire cell-days for a region and year range. "
            "Supports monthly rows ('month'), peak-season totals Aug-Oct ('season'), or annual totals ('year')."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "region": {
                    "type": "string",
                    "enum": list(VALID_REGIONS),
                    "description": "Region identifier: peru, amazonia, sierra, or costa.",
                },
                "from_year": {
                    "type": "integer",
                    "description": "Start year between 2000 and 2026.",
                },
                "to_year": {
                    "type": "integer",
                    "description": "End year between 2000 and 2026.",
                },
                "aggregate": {
                    "type": "string",
                    "enum": ["month", "season", "year"],
                    "description": "Aggregation level: month (max 4 years at once), season (Aug-Oct), or year.",
                },
            },
            "required": ["region", "from_year", "to_year", "aggregate"],
            "additionalProperties": False,
        },
    },
    {
        "name": "compare_periods",
        "description": (
            "Compare fire activity between two periods in a region. "
            "Each period can be a year ('2024'), a year-month ('2024-09'), or a peak season ('2024-season')."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "region": {
                    "type": "string",
                    "enum": list(VALID_REGIONS),
                },
                "period_a": {
                    "type": "string",
                    "description": "First period: 'YYYY', 'YYYY-MM', or 'YYYY-season'.",
                },
                "period_b": {
                    "type": "string",
                    "description": "Second period: 'YYYY', 'YYYY-MM', or 'YYYY-season'.",
                },
            },
            "required": ["region", "period_a", "period_b"],
            "additionalProperties": False,
        },
    },
    {
        "name": "rank_years",
        "description": (
            "Rank years by harmonized fire activity ('estimated' full-year total or 'season' Aug-Oct total) "
            "for a region within a year range."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "region": {
                    "type": "string",
                    "enum": list(VALID_REGIONS),
                },
                "metric": {
                    "type": "string",
                    "enum": ["estimated", "season"],
                    "description": "'estimated' for full-year total or 'season' for Aug-Oct peak season total.",
                },
                "top": {
                    "type": "integer",
                    "description": "Number of top years to return (1 to 27).",
                },
                "from_year": {
                    "type": "integer",
                    "description": "Start year between 2000 and 2026.",
                },
                "to_year": {
                    "type": "integer",
                    "description": "End year between 2000 and 2026.",
                },
            },
            "required": ["region", "metric", "top", "from_year", "to_year"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_methodology",
        "description": (
            "Read verified methodology details, validation metrics, detection probabilities, "
            "MODIS emulator performance, seasonal forecast evaluation and 2027 departmental outlooks (all 25 departments including Cusco/Machu Picchu, Ucayali, Madre de Dios, Puno, etc. under topic='forecast'), physical findings, periods, or limits."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "enum": [
                        "validation",
                        "detection",
                        "emulator",
                        "forecast",
                        "findings",
                        "periods",
                        "limits",
                    ],
                },
            },
            "required": ["topic"],
            "additionalProperties": False,
        },
    },
    {
        "name": "show_chart",
        "description": (
            "Request the server to render a chart in the chat panel using verified processed data. "
            "Charts: 'series', 'raw_vs_corrected', 'year_vs_history', or 'forecast'."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "chart": {
                    "type": "string",
                    "enum": ["series", "raw_vs_corrected", "year_vs_history", "forecast"],
                },
                "region": {
                    "type": "string",
                    "enum": list(VALID_REGIONS),
                },
                "from_year": {
                    "type": "integer",
                },
                "to_year": {
                    "type": "integer",
                },
                "highlight_year": {
                    "type": ["integer", "null"],
                },
            },
            "required": ["chart", "region", "from_year", "to_year", "highlight_year"],
            "additionalProperties": False,
        },
    },
]

TOOL_LABELS = {
    "get_series": "Reading the harmonized series…",
    "compare_periods": "Comparing periods…",
    "rank_years": "Ranking years by fire activity…",
    "get_methodology": "Reading methodology and validation…",
    "show_chart": "Preparing chart from processed data…",
}


def _load_json(filename: str) -> Any:
    path = PROCESSED_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"{filename} is not available in {PROCESSED_DIR}.")
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def _ym_str(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _period_flags_for_month(year: int, month: int, is_forecast: bool, periods: list[dict[str, Any]]) -> dict[str, Any]:
    if is_forecast:
        return {
            "confidence": "forecast",
            "partial": False,
            "provisional": False,
            "low_confidence": False,
            "is_forecast": True,
        }
    ym = _ym_str(year, month)
    matched: dict[str, Any] = {}
    for period in periods:
        if period.get("from", "") <= ym <= period.get("to", ""):
            matched = period
            break
    confidence = matched.get("confidence", "normal")
    partial_through = matched.get("partial_through")
    is_partial = bool(partial_through) or (year == 2000)
    is_provisional = confidence == "provisional"
    is_low = confidence == "low"
    result: dict[str, Any] = {
        "confidence": confidence,
        "partial": is_partial,
        "provisional": is_provisional,
        "low_confidence": is_low,
        "is_forecast": False,
    }
    if partial_through:
        result["partial_through"] = partial_through
    if matched.get("note"):
        result["note"] = matched["note"]
    return result


def _classify_against_baseline(value: float, baseline_values: list[float]) -> str:
    if not baseline_values:
        return "normal"
    p25, p75, p90 = np.percentile(baseline_values, ANOMALY_PERCENTILES)
    if value < p25:
        return "low"
    if value <= p75:
        return "normal"
    if value <= p90:
        return "high"
    return "very_high"


def _load_replicates_interval(region: str, year: int, months: tuple[int, ...]) -> tuple[float | None, float | None]:
    path = INTERIM_DIR / "series_replicates.parquet"
    if not path.is_file():
        return None, None
    placeholders = ",".join("?" for _ in months)
    sql = (
        f"SELECT replicate, sum(estimated) AS total "
        f"FROM read_parquet(?) "
        f"WHERE region = ? AND year = ? AND month IN ({placeholders}) "
        f"GROUP BY replicate ORDER BY replicate"
    )
    params: list[Any] = [str(path), region, year, *months]
    try:
        with duckdb.connect() as con:
            rows = con.execute(sql, params).fetchall()
        if not rows:
            return None, None
        totals = np.array([float(r[1]) for r in rows], dtype=float)
        lo, hi = np.quantile(totals, CI_TAILS)
        return round(float(lo), 1), round(float(hi), 1)
    except Exception:
        return None, None


def _validate_region_and_years(region: Any, from_year: Any, to_year: Any) -> str | None:
    if region not in VALID_REGIONS:
        return f"Invalid region '{region}'. Valid regions are: {', '.join(VALID_REGIONS)}. Departmental series are not available."
    if not isinstance(from_year, int) or not isinstance(to_year, int):
        return "from_year and to_year must be integers between 2000 and 2026."
    if from_year < MIN_YEAR or to_year > MAX_YEAR:
        return f"Years must be between {MIN_YEAR} and {MAX_YEAR}."
    if from_year > to_year:
        return "from_year cannot be greater than to_year."
    return None


def _aggregate_years_or_seasons(
    rows: list[dict[str, Any]],
    region: str,
    from_year: int,
    to_year: int,
    aggregate: str,
    periods: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], bool]:
    observed_rows = [r for r in rows if r["region"] == region and not r.get("is_forecast", False)]
    target_months = SEASON_MONTHS if aggregate == "season" else tuple(range(1, 13))
    expected_count = len(target_months)

    by_year: dict[int, list[dict[str, Any]]] = {}
    for row in observed_rows:
        if row["month"] in target_months:
            by_year.setdefault(row["year"], []).append(row)

    baseline_totals: list[float] = []
    for y in range(HISTORY_YEARS[0], HISTORY_YEARS[1] + 1):
        y_rows = by_year.get(y, [])
        if len(y_rows) == expected_count:
            baseline_totals.append(sum(float(r["estimated"]) for r in y_rows))
    hist_median = round(float(np.median(baseline_totals)), 1) if baseline_totals else None

    result_rows: list[dict[str, Any]] = []
    replicates_used = False
    for year in range(from_year, to_year + 1):
        y_rows = sorted(by_year.get(year, []), key=lambda r: r["month"])
        if not y_rows:
            continue
        est_total = round(sum(float(r["estimated"]) for r in y_rows), 1)
        raw_det_total = int(sum(int(r["raw_detections"] or 0) for r in y_rows))
        raw_modis_total = int(sum(int(r["raw_modis"] or 0) for r in y_rows))
        has_viirs = any(r["raw_viirs"] is not None for r in y_rows)
        raw_viirs_total = int(sum(int(r["raw_viirs"] or 0) for r in y_rows)) if has_viirs else None

        month_flags = [_period_flags_for_month(year, r["month"], False, periods) for r in y_rows]
        has_partial_month = any(f["partial"] for f in month_flags)
        is_incomplete_window = len(y_rows) < expected_count or has_partial_month
        is_provisional = any(f["provisional"] for f in month_flags)
        is_low_conf = any(f["low_confidence"] for f in month_flags)
        confidence = "low" if is_low_conf else ("provisional" if is_provisional else "normal")

        lo, hi = (None, None)
        if not is_incomplete_window:
            lo, hi = _load_replicates_interval(region, year, target_months)
            if lo is not None and hi is not None:
                replicates_used = True
                lo = round(min(lo, est_total), 1)
                hi = round(max(hi, est_total), 1)

        sources = sorted({r["source"] for r in y_rows})
        source_label = sources[0] if len(sources) == 1 else "+".join(sources)
        anomaly_class = _classify_against_baseline(est_total, baseline_totals) if not is_incomplete_window else "partial"

        entry: dict[str, Any] = {
            "region": region,
            "year": year,
            "aggregate": aggregate,
            "months_included": [r["month"] for r in y_rows],
            "estimated": est_total,
            "est_low": lo,
            "est_high": hi,
            "raw_detections": raw_det_total,
            "raw_modis": raw_modis_total,
            "raw_viirs": raw_viirs_total,
            "hist_median": hist_median,
            "anomaly_class": anomaly_class,
            "source": source_label,
            "is_forecast": False,
            "confidence": confidence,
            "partial": is_incomplete_window,
            "provisional": is_provisional,
            "low_confidence": is_low_conf,
        }
        if year == 2026 and aggregate == "year":
            entry["partial_through"] = "2026-11-13"
            entry["note"] = "2026 observed data reaches 2026-11-13 (10 complete months Jan-Oct plus partial Nov 1-13); December 2026 is a separate forecast row."
        elif year == 2000 and aggregate == "year":
            entry["note"] = "Year 2000 only has November and December (MODIS Terra start) with low confidence."
        result_rows.append(entry)

    return result_rows, replicates_used


def tool_get_series(tool_input: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    region = tool_input.get("region")
    from_year = tool_input.get("from_year")
    to_year = tool_input.get("to_year")
    aggregate = tool_input.get("aggregate")

    err = _validate_region_and_years(region, from_year, to_year)
    if err:
        return {"error": err, "unit": UNIT}, True
    if aggregate not in ("month", "season", "year"):
        return {"error": "aggregate must be 'month', 'season', or 'year'.", "unit": UNIT}, True

    rows = _load_json("series.json")
    methodology = _load_json("methodology.json")
    periods = methodology.get("periods", [])

    if aggregate == "month":
        selected = [
            r for r in rows
            if r["region"] == region and from_year <= r["year"] <= to_year
        ]
        selected.sort(key=lambda r: (r["year"], r["month"]))
        if len(selected) > MAX_MONTHLY_ROWS:
            return {
                "error": (
                    f"Monthly query returned {len(selected)} rows (max {MAX_MONTHLY_ROWS}). "
                    "Use aggregate='year' or 'season' for multi-year spans, or narrow from_year..to_year to at most 4 years."
                ),
                "unit": UNIT,
            }, True
        enriched: list[dict[str, Any]] = []
        for r in selected:
            flags = _period_flags_for_month(r["year"], r["month"], bool(r.get("is_forecast")), periods)
            enriched.append({
                "region": r["region"],
                "year": r["year"],
                "month": r["month"],
                "estimated": r["estimated"],
                "est_low": r["est_low"],
                "est_high": r["est_high"],
                "raw_detections": r["raw_detections"],
                "raw_modis": r["raw_modis"],
                "raw_viirs": r["raw_viirs"],
                "modis_equiv": r["modis_equiv"],
                "hist_median": r["hist_median"],
                "anomaly_class": r["anomaly_class"],
                "source": r["source"],
                **flags,
            })
        return {
            "unit": UNIT,
            "region": region,
            "region_label": REGION_LABELS[region],
            "aggregate": "month",
            "ci_level": 0.90,
            "qualifier": "at least (minimum active fire cell-days at satellite overpass)",
            "rows": enriched,
            "decision_profile": DECISION_PROFILES.get(region, DECISION_PROFILES["peru"]),
        }, False

    agg_rows, replicates_used = _aggregate_years_or_seasons(rows, region, from_year, to_year, aggregate, periods)
    response: dict[str, Any] = {
        "unit": UNIT,
        "region": region,
        "region_label": REGION_LABELS[region],
        "aggregate": aggregate,
        "ci_level": 0.90,
        "qualifier": "at least (minimum active fire cell-days at satellite overpass)",
        "rows": agg_rows,
        "decision_profile": DECISION_PROFILES.get(region, DECISION_PROFILES["peru"]),
    }
    if not replicates_used or any(r.get("est_low") is None for r in agg_rows):
        response["range_note"] = (
            "Annual and seasonal 90% uncertainty ranges require aligned bootstrap replicates; "
            "where they are not available the range is left empty, because monthly interval endpoints "
            "are never summed across months. Only the point estimate ('estimated') is reported for those periods."
        )
    if from_year <= 2026 <= to_year:
        forecast_rows = [
            {
                "region": r["region"],
                "year": r["year"],
                "month": r["month"],
                "estimated": r["estimated"],
                "est_low": r["est_low"],
                "est_high": r["est_high"],
                "hist_median": r["hist_median"],
                "anomaly_class": r["anomaly_class"],
                "source": r["source"],
                "is_forecast": True,
            }
            for r in rows
            if r["region"] == region and r.get("is_forecast")
        ]
        if forecast_rows:
            response["forecast_rows"] = forecast_rows
    return response, False


def _parse_period_spec(spec: str) -> dict[str, Any] | None:
    text = spec.strip().lower()
    if text.endswith("-season"):
        year_part = text[:-7]
        if year_part.isdigit():
            year = int(year_part)
            if MIN_YEAR <= year <= MAX_YEAR:
                return {"kind": "season", "year": year, "label": f"{year}-season (Aug-Oct)"}
        return None
    if "-" in text:
        parts = text.split("-")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            year, month = int(parts[0]), int(parts[1])
            if MIN_YEAR <= year <= MAX_YEAR and 1 <= month <= 12:
                return {"kind": "month", "year": year, "month": month, "label": f"{year:04d}-{month:02d}"}
        return None
    if text.isdigit():
        year = int(text)
        if MIN_YEAR <= year <= MAX_YEAR:
            return {"kind": "year", "year": year, "label": str(year)}
    return None


def _evaluate_period(
    spec_info: dict[str, Any],
    region: str,
    rows: list[dict[str, Any]],
    periods: list[dict[str, Any]],
) -> dict[str, Any] | None:
    kind = spec_info["kind"]
    year = spec_info["year"]
    if kind == "month":
        month = spec_info["month"]
        match = next((r for r in rows if r["region"] == region and r["year"] == year and r["month"] == month), None)
        if not match:
            return None
        flags = _period_flags_for_month(year, month, bool(match.get("is_forecast")), periods)
        return {
            "period": spec_info["label"],
            "kind": "month",
            "year": year,
            "month": month,
            "estimated": match["estimated"],
            "est_low": match["est_low"],
            "est_high": match["est_high"],
            "raw_detections": match["raw_detections"],
            "hist_median": match["hist_median"],
            "anomaly_class": match["anomaly_class"],
            "source": match["source"],
            **flags,
        }
    agg_rows, _ = _aggregate_years_or_seasons(rows, region, year, year, kind, periods)
    if not agg_rows:
        return None
    row = agg_rows[0]
    return {
        "period": spec_info["label"],
        "kind": kind,
        "year": year,
        "months_included": row["months_included"],
        "estimated": row["estimated"],
        "est_low": row["est_low"],
        "est_high": row["est_high"],
        "raw_detections": row["raw_detections"],
        "hist_median": row["hist_median"],
        "anomaly_class": row["anomaly_class"],
        "source": row["source"],
        "confidence": row["confidence"],
        "partial": row["partial"],
        "provisional": row["provisional"],
        "low_confidence": row["low_confidence"],
        "is_forecast": False,
        **({"partial_through": row["partial_through"]} if "partial_through" in row else {}),
        **({"note": row["note"]} if "note" in row else {}),
    }


def tool_compare_periods(tool_input: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    region = tool_input.get("region")
    period_a_raw = str(tool_input.get("period_a", ""))
    period_b_raw = str(tool_input.get("period_b", ""))

    if region not in VALID_REGIONS:
        return {
            "error": f"Invalid region '{region}'. Valid regions are: {', '.join(VALID_REGIONS)}.",
            "unit": UNIT,
        }, True

    spec_a = _parse_period_spec(period_a_raw)
    spec_b = _parse_period_spec(period_b_raw)
    if not spec_a or not spec_b:
        return {
            "error": (
                "Invalid period format. Use 'YYYY' for a year (e.g. '2024'), "
                "'YYYY-MM' for a month (e.g. '2024-09'), or 'YYYY-season' for Aug-Oct season (e.g. '2024-season')."
            ),
            "unit": UNIT,
        }, True
    if spec_a["kind"] != spec_b["kind"]:
        return {
            "error": f"Cannot compare different period types ('{spec_a['kind']}' vs '{spec_b['kind']}'). Use matching types.",
            "unit": UNIT,
        }, True

    rows = _load_json("series.json")
    methodology = _load_json("methodology.json")
    periods = methodology.get("periods", [])

    val_a = _evaluate_period(spec_a, region, rows, periods)
    val_b = _evaluate_period(spec_b, region, rows, periods)
    if not val_a or not val_b:
        return {"error": "No data available for one or both requested periods.", "unit": UNIT}, True

    est_a = float(val_a["estimated"])
    est_b = float(val_b["estimated"])
    diff = round(est_a - est_b, 1)
    pct_diff = round(((est_a - est_b) / est_b) * 100.0, 1) if est_b > 0 else None
    ratio = round(est_a / est_b, 2) if est_b > 0 else None

    result: dict[str, Any] = {
        "unit": UNIT,
        "region": region,
        "region_label": REGION_LABELS[region],
        "period_a": val_a,
        "period_b": val_b,
        "difference": diff,
        "pct_difference_a_vs_b": pct_diff,
        "ratio_a_over_b": ratio,
        "decision_profile": DECISION_PROFILES.get(region, DECISION_PROFILES["peru"]),
    }

    if spec_a["kind"] == "year" and (val_a["partial"] or val_b["partial"]):
        result["partial_year_warning"] = (
            "One of the compared years is incomplete (2026 reaches 2026-11-13; 2000 only has Nov-Dec). "
            "Never compare an incomplete year against a full 12-month year without stating it is partial. "
            "Use 'same_complete_months_comparison' below for an apples-to-apples Jan-Oct comparison."
        )
        if 2026 in (spec_a["year"], spec_b["year"]) and 2000 not in (spec_a["year"], spec_b["year"]):
            jan_oct_a = [
                r for r in rows
                if r["region"] == region and r["year"] == spec_a["year"] and 1 <= r["month"] <= 10 and not r.get("is_forecast")
            ]
            jan_oct_b = [
                r for r in rows
                if r["region"] == region and r["year"] == spec_b["year"] and 1 <= r["month"] <= 10 and not r.get("is_forecast")
            ]
            sum_a = round(sum(float(r["estimated"]) for r in jan_oct_a), 1)
            sum_b = round(sum(float(r["estimated"]) for r in jan_oct_b), 1)
            jan_oct_pct = round(((sum_a - sum_b) / sum_b) * 100.0, 1) if sum_b > 0 else None
            result["same_complete_months_comparison"] = {
                "window": "Jan-Oct (months 1..10)",
                "year_a": spec_a["year"],
                "estimated_a_jan_oct": sum_a,
                "year_b": spec_b["year"],
                "estimated_b_jan_oct": sum_b,
                "difference_jan_oct": round(sum_a - sum_b, 1),
                "pct_difference_jan_oct": jan_oct_pct,
            }

    return result, False


def tool_rank_years(tool_input: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    region = tool_input.get("region")
    metric = tool_input.get("metric")
    top = tool_input.get("top")
    from_year = tool_input.get("from_year")
    to_year = tool_input.get("to_year")

    err = _validate_region_and_years(region, from_year, to_year)
    if err:
        return {"error": err, "unit": UNIT}, True
    if metric not in ("estimated", "season"):
        return {"error": "metric must be 'estimated' (full year) or 'season' (Aug-Oct).", "unit": UNIT}, True
    if not isinstance(top, int) or top < 1 or top > 27:
        return {"error": "top must be an integer between 1 and 27.", "unit": UNIT}, True

    rows = _load_json("series.json")
    methodology = _load_json("methodology.json")
    periods = methodology.get("periods", [])

    agg_mode = "season" if metric == "season" else "year"
    agg_rows, _ = _aggregate_years_or_seasons(rows, region, from_year, to_year, agg_mode, periods)

    complete_rows = [r for r in agg_rows if not r["partial"]]
    partial_rows = [r for r in agg_rows if r["partial"]]

    ranked_complete = sorted(complete_rows, key=lambda r: float(r["estimated"]), reverse=True)[:top]
    rankings = []
    for idx, r in enumerate(ranked_complete, start=1):
        rankings.append({
            "rank": idx,
            "year": r["year"],
            "estimated": r["estimated"],
            "est_low": r["est_low"],
            "est_high": r["est_high"],
            "raw_detections": r["raw_detections"],
            "anomaly_class": r["anomaly_class"],
            "confidence": r["confidence"],
            "provisional": r["provisional"],
            "low_confidence": r["low_confidence"],
            "partial": r["partial"],
        })

    peak_months = [
        r for r in rows
        if r["region"] == region and from_year <= r["year"] <= to_year and not r.get("is_forecast")
    ]
    peak_months_sorted = sorted(peak_months, key=lambda r: float(r["estimated"]), reverse=True)[:5]
    top_months = [
        {
            "year": r["year"],
            "month": r["month"],
            "estimated": r["estimated"],
            "est_low": r["est_low"],
            "est_high": r["est_high"],
            "raw_detections": r["raw_detections"],
            "anomaly_class": r["anomaly_class"],
        }
        for r in peak_months_sorted
    ]

    result: dict[str, Any] = {
        "unit": UNIT,
        "region": region,
        "region_label": REGION_LABELS[region],
        "metric": "season_aug_oct" if metric == "season" else "annual_estimated",
        "from_year": from_year,
        "to_year": to_year,
        "rankings": rankings,
        "top_single_months": top_months,
        "decision_profile": DECISION_PROFILES.get(region, DECISION_PROFILES["peru"]),
    }
    if partial_rows:
        result["excluded_partial_years"] = [
            {
                "year": r["year"],
                "estimated_so_far": r["estimated"],
                "months_included": r["months_included"],
                "partial": True,
                "provisional": r["provisional"],
                "low_confidence": r["low_confidence"],
                "note": r.get("note", "Partial year excluded from full-year ranking."),
            }
            for r in partial_rows
        ]
    return result, False


def tool_get_methodology(tool_input: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    topic = tool_input.get("topic")
    valid_topics = ("validation", "detection", "emulator", "forecast", "findings", "periods", "limits")
    if topic not in valid_topics:
        return {"error": f"Invalid topic '{topic}'. Choose from: {', '.join(valid_topics)}.", "unit": UNIT}, True

    methodology = _load_json("methodology.json")
    params = methodology.get("params", {})

    if topic == "validation":
        return {
            "unit": UNIT,
            "topic": "validation",
            "params": params,
            "validation": methodology.get("validation", []),
            "definitions": {
                k: methodology.get("findings", {}).get("definitions", {}).get(k)
                for k in ("validation", "mapbiomas")
            },
        }, False

    if topic == "detection":
        det_rows = methodology.get("detection", [])
        summary_by_region: dict[str, Any] = {}
        for r in VALID_REGIONS:
            r_rows = [row for row in det_rows if row["region"] == r]
            if r_rows:
                peak_rows = [row for row in r_rows if row["month"] in SEASON_MONTHS]
                summary_by_region[r] = {
                    "annual_mean_p_modis": round(float(np.mean([x["p_modis"] for x in r_rows])), 4),
                    "annual_mean_p_viirs": round(float(np.mean([x["p_viirs"] for x in r_rows])), 4),
                    "peak_season_mean_p_modis": round(float(np.mean([x["p_modis"] for x in peak_rows])), 4),
                    "peak_season_mean_p_viirs": round(float(np.mean([x["p_viirs"] for x in peak_rows])), 4),
                    "september": next((x for x in r_rows if x["month"] == 9), None),
                    "monthly": [
                        {
                            "month": x["month"],
                            "n_modis": x["n_modis"],
                            "n_viirs": x["n_viirs"],
                            "n_both": x["n_both"],
                            "p_modis": round(float(x["p_modis"]), 4),
                            "p_viirs": round(float(x["p_viirs"]), 4),
                        }
                        for x in r_rows
                    ],
                }
        return {
            "unit": UNIT,
            "topic": "detection",
            "params": params,
            "by_region": summary_by_region,
        }, False

    if topic == "emulator":
        return {
            "unit": UNIT,
            "topic": "emulator",
            "emulator": methodology.get("emulator", {}),
            "emulator_drift_2025": methodology.get("findings", {}).get("emulator_drift"),
            "emulator_drift_latest_2026": methodology.get("findings", {}).get("emulator_drift_latest"),
        }, False

    if topic == "forecast":
        fc = methodology.get("forecast", {})
        fc_file = _load_json("forecast.json")
        dept_outlooks = []
        for u in fc_file.get("regions", []):
            dept_outlooks.append({
                "region": u.get("region"),
                "name": u.get("name"),
                "level": u.get("level"),
                "macroregion": u.get("macroregion"),
                "target_year": u.get("target_year", fc_file.get("target_year", 2027)),
                "season_months": fc_file.get("season_months", [8, 9, 10]),
                "published": u.get("published"),
                "method": u.get("method"),
                "hist_median_2003_2025": u.get("hist_median"),
                "predicted_median": u.get("median"),
                "predicted_low_90": u.get("low"),
                "predicted_high_90": u.get("high"),
                "most_likely_class": u.get("most_likely_class"),
                "probabilities": u.get("probabilities"),
                "predictors": u.get("predictors"),
                "pct_vs_hist_median": round(((float(u["median"]) - float(u["hist_median"])) / float(u["hist_median"])) * 100.0, 1) if u.get("median") is not None and u.get("hist_median") else None,
                "alert_level": {"very_high": "CRITICAL / VERY HIGH", "high": "HIGH ALERT", "normal": "NORMAL / MODERATE", "low": "LOW"}.get(str(u.get("most_likely_class") or ""), "NORMAL / MODERATE"),
                "decision_profile": DECISION_PROFILES.get(u.get("macroregion") or u.get("region") or "peru", DECISION_PROFILES["peru"]),
            })
        return {
            "unit": UNIT,
            "topic": "forecast",
            "model": fc.get("model"),
            "variant": fc.get("variant"),
            "origin": fc.get("origin"),
            "excluded_partial_month": fc.get("excluded_partial_month"),
            "published": fc.get("published", []),
            "season_outlook_2027_all_units": dept_outlooks,
            "backtest_by_region": fc.get("backtest", {}).get("by_region", []),
            "out_of_sample_2026": fc.get("out_of_sample", {}).get("by_region", []),
            "raw_vs_corrected": fc.get("raw_vs_corrected", {}),
            "definitions": fc.get("definitions", {}),
        }, False

    if topic == "findings":
        findings = methodology.get("findings", {})
        return {
            "unit": UNIT,
            "topic": "findings",
            "calibration_overpass_gaps": findings.get("calibration_overpass_gaps", []),
            "chapman_correlated_bias_pct": findings.get("chapman_correlated_bias_pct"),
            "emulator_drift_2025": findings.get("emulator_drift"),
            "emulator_drift_latest_2026": findings.get("emulator_drift_latest"),
            "static_source_mask": {
                "mask_years": findings.get("static_source_mask", {}).get("mask_years"),
                "cells": findings.get("static_source_mask", {}).get("cells"),
                "nrt_removed": findings.get("static_source_mask", {}).get("nrt_removed"),
                "validation": findings.get("static_source_mask", {}).get("validation"),
            },
            "noaa20_ratio": findings.get("noaa20_ratio"),
            "aqua_overpass_by_year": findings.get("aqua_overpass_by_year"),
            "raw_vs_corrected_trend": methodology.get("forecast", {}).get("raw_vs_corrected", {}).get("trend", []),
        }, False

    if topic == "periods":
        return {
            "unit": UNIT,
            "topic": "periods",
            "periods": methodology.get("periods", []),
            "definitions": {
                k: methodology.get("findings", {}).get("definitions", {}).get(k)
                for k in ("periods", "provisional", "structural_error", "annual_range")
            },
        }, False

    return {
        "unit": UNIT,
        "topic": "limits",
        "key_limits": [
            "Activity unit is fire cell-days (0.1 degree ~ 11 km grid cell with >=1 vegetation fire detection on a UTC day), never individual wildfires or burned hectares.",
            "Shared blind spots (clouds, heavy smoke, short-lived burns between satellite overpasses) create positive dependence between sensors, so Chapman estimates are a conservative lower bound ('at least'). Synthetic correlated-detection tests show ~28.8% underestimation under realistic dependence.",
            "Pre-2003 records (2000-11 to 2002-12) have low confidence because MODIS Aqua started on 2002-07-04 and 2000-11 to 2002-06 relies on the MODIS Terra morning overpass bridge.",
            "2026 data from August onward is near-real-time (NRT, provisional) filtered with a static industrial/flaring source mask; November 2026 is partial through 2026-11-13 and uses NOAA-20 scaled to S-NPP after 2026-11-01.",
            "The app only models Peru and the three macroregions (Amazon, Andes/Sierra, Coast), not department-level series or fire causes.",
        ],
        "chapman_correlated_bias_pct": methodology.get("findings", {}).get("chapman_correlated_bias_pct"),
        "definitions": methodology.get("findings", {}).get("definitions", {}),
    }, False


def build_chart_event(tool_input: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    chart = tool_input.get("chart")
    region = tool_input.get("region")
    from_year = tool_input.get("from_year")
    to_year = tool_input.get("to_year")
    highlight_year = tool_input.get("highlight_year")

    err = _validate_region_and_years(region, from_year, to_year)
    if err:
        return {"error": err, "unit": UNIT}, True
    if chart not in ("series", "raw_vs_corrected", "year_vs_history", "forecast"):
        return {"error": "Invalid chart type.", "unit": UNIT}, True
    if highlight_year is not None:
        if isinstance(highlight_year, str) and highlight_year.isdigit():
            highlight_year = int(highlight_year)
        if not isinstance(highlight_year, int) or highlight_year < MIN_YEAR or highlight_year > MAX_YEAR:
            return {"error": f"highlight_year must be null or an integer between {MIN_YEAR} and {MAX_YEAR}.", "unit": UNIT}, True

    rows = _load_json("series.json")
    methodology = _load_json("methodology.json")
    periods = methodology.get("periods", [])
    region_label = REGION_LABELS[region]

    if chart in ("series", "raw_vs_corrected"):
        agg_rows, _ = _aggregate_years_or_seasons(rows, region, from_year, to_year, "year", periods)
        points = [
            {
                "year": r["year"],
                "estimated": r["estimated"],
                "est_low": r["est_low"],
                "est_high": r["est_high"],
                "raw_detections": r["raw_detections"],
                "raw_modis": r["raw_modis"],
                "raw_viirs": r["raw_viirs"],
                "anomaly_class": r["anomaly_class"],
                "partial": r["partial"],
                "provisional": r["provisional"],
                "low_confidence": r["low_confidence"],
            }
            for r in agg_rows
        ]
        title = (
            f"{region_label}: Raw detections vs. harmonized estimate ({from_year}–{to_year})"
            if chart == "raw_vs_corrected"
            else f"{region_label}: Harmonized fire activity ({from_year}–{to_year})"
        )
        return {
            "chart": chart,
            "title": title,
            "unit": UNIT,
            "region": region,
            "region_label": region_label,
            "from_year": from_year,
            "to_year": to_year,
            "highlight_year": highlight_year,
            "series": points,
        }, False

    if chart == "year_vs_history":
        target_year = highlight_year if highlight_year is not None else to_year
        target_rows = [
            r for r in rows
            if r["region"] == region and r["year"] == target_year
        ]
        target_rows.sort(key=lambda r: r["month"])
        points = [
            {
                "year": r["year"],
                "month": r["month"],
                "estimated": r["estimated"],
                "est_low": r["est_low"],
                "est_high": r["est_high"],
                "hist_median": r["hist_median"],
                "anomaly_class": r["anomaly_class"],
                "is_forecast": bool(r.get("is_forecast")),
                **_period_flags_for_month(r["year"], r["month"], bool(r.get("is_forecast")), periods),
            }
            for r in target_rows
        ]
        return {
            "chart": "year_vs_history",
            "title": f"{region_label}: {target_year} monthly activity vs. 2003–2025 median",
            "unit": UNIT,
            "region": region,
            "region_label": region_label,
            "from_year": from_year,
            "to_year": to_year,
            "highlight_year": target_year,
            "series": points,
        }, False

    recent_rows = [
        r for r in rows
        if r["region"] == region and r["year"] == 2026
    ]
    recent_rows.sort(key=lambda r: r["month"])
    points = [
        {
            "year": r["year"],
            "month": r["month"],
            "estimated": r["estimated"],
            "est_low": r["est_low"],
            "est_high": r["est_high"],
            "hist_median": r["hist_median"],
            "anomaly_class": r["anomaly_class"],
            "is_forecast": bool(r.get("is_forecast")),
            "source": r["source"],
            **_period_flags_for_month(r["year"], r["month"], bool(r.get("is_forecast")), periods),
        }
        for r in recent_rows
    ]
    return {
        "chart": "forecast",
        "title": f"{region_label}: 2026 observed activity and seasonal forecast",
        "unit": UNIT,
        "region": region,
        "region_label": region_label,
        "from_year": 2026,
        "to_year": 2026,
        "highlight_year": 2026,
        "series": points,
    }, False


def tool_show_chart(tool_input: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    chart_event, is_err = build_chart_event(tool_input)
    if is_err:
        return chart_event, True
    series_points = chart_event.get("series", [])
    return {
        "status": "chart_queued",
        "chart": chart_event["chart"],
        "title": chart_event["title"],
        "unit": UNIT,
        "region": chart_event["region"],
        "points_count": len(series_points),
        "highlight_year": chart_event["highlight_year"],
    }, False


def execute_tool(name: str, tool_input: Any) -> tuple[dict[str, Any], bool, dict[str, Any] | None]:
    if not isinstance(tool_input, dict):
        return {"error": "Tool input must be a JSON object.", "unit": UNIT}, True, None

    try:
        if name == "get_series":
            res, is_err = tool_get_series(tool_input)
            return res, is_err, None
        if name == "compare_periods":
            res, is_err = tool_compare_periods(tool_input)
            return res, is_err, None
        if name == "rank_years":
            res, is_err = tool_rank_years(tool_input)
            return res, is_err, None
        if name == "get_methodology":
            res, is_err = tool_get_methodology(tool_input)
            return res, is_err, None
        if name == "show_chart":
            chart_event, is_err = build_chart_event(tool_input)
            if is_err:
                return chart_event, True, None
            res, _ = tool_show_chart(tool_input)
            return res, False, chart_event
        return {"error": f"Unknown tool '{name}'.", "unit": UNIT}, True, None
    except Exception as exc:
        return {"error": f"Tool execution error: {exc}", "unit": UNIT}, True, None
