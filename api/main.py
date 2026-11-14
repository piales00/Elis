import json
import os
from pathlib import Path
from typing import Any

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
CORS_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "*").split(",") if origin.strip()]

app = FastAPI(
    title="FireChronos Perú API",
    description="Comparable fire-activity calendar for Peru (2000-2026), in fire cell-days.",
    version="0.1.0",
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])


def read_json(filename: str) -> Any:
    path = PROCESSED_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=503, detail=f"{filename} is not available yet.")
    try:
        with path.open(encoding="utf-8") as source:
            return json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Could not read {filename}.") from error


def records(value: Any, filename: str) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and isinstance(value.get("data"), list):
        return value["data"]
    raise HTTPException(status_code=500, detail=f"{filename} has an invalid format.")


@app.get("/regions")
def get_regions() -> dict[str, Any]:
    value = read_json("regions.geojson")
    if not isinstance(value, dict) or value.get("type") != "FeatureCollection":
        raise HTTPException(status_code=500, detail="regions.geojson is not a valid FeatureCollection.")
    return value


@app.get("/series")
def get_series(
    region: str = Query(min_length=1),
    from_year: int | None = Query(default=None, alias="from", ge=2000, le=2026),
    to_year: int | None = Query(default=None, alias="to", ge=2000, le=2026),
) -> list[dict[str, Any]]:
    if from_year is not None and to_year is not None and from_year > to_year:
        raise HTTPException(status_code=422, detail="The start year cannot be later than the end year.")
    rows = records(read_json("series.json"), "series.json")
    selected = [row for row in rows if row.get("region") == region]
    if from_year is not None:
        selected = [row for row in selected if row.get("year", 0) >= from_year]
    if to_year is not None:
        selected = [row for row in selected if row.get("year", 0) <= to_year]
    return sorted(selected, key=lambda row: (row.get("year", 0), row.get("month", 0)))


@app.get("/map")
def get_map(
    year: int = Query(ge=2000, le=2026),
    month: int = Query(ge=1, le=12),
    region: str | None = Query(default=None, min_length=1),
) -> list[dict[str, Any]]:
    path = PROCESSED_DIR / "map.parquet"
    if not path.is_file():
        raise HTTPException(status_code=503, detail="map.parquet is not available yet.")
    sql = "SELECT lat, lon, raw_terra, raw_aqua, raw_modis, raw_viirs, raw_viirs_noaa20, raw_viirs_noaa21, estimated FROM read_parquet(?) WHERE year = ? AND month = ?"
    parameters: list[Any] = [str(path), year, month]
    if region is not None:
        sql += " AND region = ?"
        parameters.append(region)
    sql += " ORDER BY lat, lon"
    try:
        with duckdb.connect() as connection:
            result = connection.execute(sql, parameters)
            columns = [column[0] for column in result.description]
            return [dict(zip(columns, row)) for row in result.fetchall()]
    except duckdb.Error as error:
        raise HTTPException(status_code=500, detail="Could not query map.parquet.") from error


@app.get("/methodology")
def get_methodology(region: str | None = Query(default=None, min_length=1)) -> dict[str, Any]:
    value = read_json("methodology.json")
    if region is None:
        return value
    if not isinstance(value, dict):
        raise HTTPException(status_code=500, detail="methodology.json has an invalid format.")
    filtered = dict(value)
    for key in ("detection", "validation"):
        if isinstance(filtered.get(key), list):
            filtered[key] = [row for row in filtered[key] if row.get("region") == region]
    return filtered


@app.get("/forecast")
def get_forecast(region: str | None = Query(default=None, min_length=1)) -> dict[str, Any]:
    value = read_json("forecast.json")
    if not isinstance(value, dict) or not isinstance(value.get("regions"), list):
        raise HTTPException(status_code=500, detail="forecast.json has an invalid format.")
    if region is None:
        return value
    regions = [row for row in value["regions"] if row.get("region") == region]
    if not regions:
        raise HTTPException(status_code=404, detail=f"No forecast entry for region '{region}'.")
    filtered = dict(value, regions=regions)
    for key in ("backtest", "out_of_sample"):
        if isinstance(filtered.get(key), dict) and isinstance(filtered[key].get("rows"), list):
            filtered[key] = dict(filtered[key], rows=[row for row in filtered[key]["rows"] if row.get("region") == region])
    return filtered
