import json
from pathlib import Path
from typing import Any

import duckdb
from fastapi import FastAPI, HTTPException, Query


PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

app = FastAPI(
    title="FireChronos Perú API",
    description="Datos del calendario comparable de actividad de fuego en Perú.",
    version="0.1.0",
)


def read_json(filename: str) -> Any:
    path = PROCESSED_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=503, detail=f"Aún no está disponible {filename}.")
    try:
        with path.open(encoding="utf-8") as source:
            return json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"No se pudo leer {filename}.") from error


def records(value: Any, filename: str) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and isinstance(value.get("data"), list):
        return value["data"]
    raise HTTPException(status_code=500, detail=f"El formato de {filename} no es válido.")


@app.get("/regions")
def get_regions() -> dict[str, Any]:
    value = read_json("regions.geojson")
    if not isinstance(value, dict) or value.get("type") != "FeatureCollection":
        raise HTTPException(status_code=500, detail="regions.geojson no es un FeatureCollection válido.")
    return value


@app.get("/series")
def get_series(
    region: str = Query(min_length=1),
    from_year: int | None = Query(default=None, alias="from", ge=2000, le=2026),
    to_year: int | None = Query(default=None, alias="to", ge=2000, le=2026),
) -> list[dict[str, Any]]:
    if from_year is not None and to_year is not None and from_year > to_year:
        raise HTTPException(status_code=422, detail="El año inicial no puede superar al año final.")
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
        raise HTTPException(status_code=503, detail="Aún no está disponible map.parquet.")
    sql = "SELECT lat, lon, raw_terra, raw_aqua, raw_modis, raw_viirs_snpp, raw_viirs_noaa20, raw_viirs_noaa21, raw_viirs, estimated FROM read_parquet(?) WHERE year = ? AND month = ?"
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
        raise HTTPException(status_code=500, detail="No se pudo consultar map.parquet.") from error


@app.get("/methodology")
def get_methodology(region: str | None = Query(default=None, min_length=1)) -> dict[str, Any]:
    value = read_json("methodology.json")
    if region is None:
        return value
    if not isinstance(value, dict):
        raise HTTPException(status_code=500, detail="El formato de methodology.json no es válido.")
    filtered = dict(value)
    for key in ("detection", "validation"):
        if isinstance(filtered.get(key), list):
            filtered[key] = [row for row in filtered[key] if row.get("region") == region]
    return filtered
