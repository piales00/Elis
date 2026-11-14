import csv
import json
import math
import re
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import shapely
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

from config import (
    BOUNDARY_SOURCE_FILE,
    BOUNDARY_SOURCE_NAME,
    BOUNDARY_SOURCE_URL,
    BOUNDARY_SIMPLIFICATION_DEG,
    DEPARTMENT_DISPLAY_NAMES,
    GRID_DEG,
    MACROREGION_DEPARTMENTS,
    MACROREGION_NAMES,
    MAX_YEAR,
    MIN_YEAR,
    MODIS_CONFIDENCE_MIN,
    PROCESSED_DIR,
    RAW_DIR,
    REGION_ID,
    REGION_NAME,
    VEGETATION_TYPE,
    VIIRS_CONFIDENCE_ACCEPTED,
)


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(character for character in normalized if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", "_", ascii_value.lower()).strip("_")


def load_departments() -> list[dict]:
    if not BOUNDARY_SOURCE_FILE.is_file():
        raise FileNotFoundError("Faltan los límites del Perú. Ejecuta scripts/download_peru_sources.py.")
    with BOUNDARY_SOURCE_FILE.open(encoding="utf-8-sig") as source:
        collection = json.load(source)
    departments = []
    seen = set()
    for feature in collection.get("features", []):
        properties = feature.get("properties", {})
        source_name = str(properties.get("NOMBDEP", "")).strip().upper()
        if not source_name:
            continue
        if source_name in seen:
            raise ValueError(f"La capa contiene el departamento duplicado {source_name}.")
        seen.add(source_name)
        geometry = feature.get("geometry")
        if not geometry:
            raise ValueError(f"El departamento {source_name} no tiene geometría.")
        polygon = shape(geometry)
        if not polygon.is_valid:
            raise ValueError(f"La geometría de {source_name} no es válida.")
        macroregion = next(
            (name for name, members in MACROREGION_DEPARTMENTS.items() if source_name in members),
            None,
        )
        if macroregion is None:
            raise ValueError(f"Falta asignar {source_name} a una macrorregión en scripts/config.py.")
        departments.append(
            {
                "source_name": source_name,
                "id": slug(source_name),
                "name": DEPARTMENT_DISPLAY_NAMES.get(source_name, source_name.title()),
                "geometry": geometry,
                "polygon": polygon,
                "macroregion": macroregion,
                "source_document": properties.get("DOCREG"),
            }
        )
    expected = set().union(*MACROREGION_DEPARTMENTS.values())
    if seen != expected:
        raise ValueError(
            f"La capa debe contener exactamente los 25 departamentos esperados; faltan {sorted(expected - seen)}, "
            f"sobran {sorted(seen - expected)}."
        )
    return sorted(departments, key=lambda department: department["id"])


def region_features(departments: list[dict]) -> dict:
    source_geometries = [department["polygon"] for department in departments]
    if shapely.coverage_is_valid(source_geometries):
        display_geometries = shapely.coverage_simplify(source_geometries, BOUNDARY_SIMPLIFICATION_DEG)
    else:
        display_geometries = [
            geometry.simplify(BOUNDARY_SIMPLIFICATION_DEG, preserve_topology=True)
            for geometry in source_geometries
        ]
    display_by_id = {
        department["id"]: geometry
        for department, geometry in zip(departments, display_geometries)
    }
    peru_geometry = unary_union(list(display_geometries))
    features = [
        {
            "type": "Feature",
            "id": REGION_ID,
            "properties": {"id": REGION_ID, "name": REGION_NAME, "level": "pais"},
            "geometry": mapping(peru_geometry),
        }
    ]
    macroregion_metadata = {}
    for macro_id, macro_name in MACROREGION_NAMES.items():
        members = [department for department in departments if department["macroregion"] == macro_id]
        polygon = unary_union([display_by_id[department["id"]] for department in members])
        member_ids = [department["id"] for department in members]
        macroregion_metadata[macro_id] = member_ids
        features.append(
            {
                "type": "Feature",
                "id": macro_id,
                "properties": {
                    "id": macro_id,
                    "name": macro_name,
                    "level": "macro",
                    "departments": member_ids,
                },
                "geometry": mapping(polygon),
            }
        )
    for department in departments:
        features.append(
            {
                "type": "Feature",
                "id": department["id"],
                "properties": {
                    "id": department["id"],
                    "name": department["name"],
                    "level": "departamento",
                    "macroregion": department["macroregion"],
                    "source_document": department["source_document"],
                },
                "geometry": mapping(display_by_id[department["id"]]),
            }
        )
    return {
        "type": "FeatureCollection",
        "metadata": {
            "country": "Perú",
            "source": BOUNDARY_SOURCE_NAME,
            "source_url": BOUNDARY_SOURCE_URL,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "boundary_note": "Límites censales referenciales; no sustituyen una delimitación legal.",
            "display_simplification_degrees": BOUNDARY_SIMPLIFICATION_DEG,
            "activity_filter_uses_unsimplified_boundaries": True,
            "macroregion_note": "Agrupación aproximada de departamentos completos aprobada por el equipo.",
            "macroregions": macroregion_metadata,
        },
        "features": features,
    }


def write_regions(departments: list[dict]) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    collection = region_features(departments)
    destination = PROCESSED_DIR / "regions.geojson"
    with tempfile.TemporaryDirectory(prefix="firechronos_regions_", dir=PROCESSED_DIR) as temporary:
        temporary_file = Path(temporary) / destination.name
        temporary_file.write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
        temporary_file.replace(destination)


def classify_file(path: Path, row: dict[str, str]) -> str | None:
    filename = path.name.lower()
    if filename.startswith("modis_"):
        satellite = row.get("satellite", "").strip().upper()
        if "TERRA" in satellite:
            return "terra"
        if "AQUA" in satellite:
            return "aqua"
        return None
    if filename.startswith("viirs-") or "noaa20" in filename or "noaa21" in filename:
        return "viirs"
    return None


def accepted_row(path: Path, row: dict[str, str]) -> str | None:
    if row.get("type", "").strip() != VEGETATION_TYPE:
        return None
    sensor = classify_file(path, row)
    if sensor in {"terra", "aqua"}:
        try:
            if int(float(row.get("confidence", ""))) < MODIS_CONFIDENCE_MIN:
                return None
        except (TypeError, ValueError):
            return None
    elif sensor == "viirs":
        if row.get("confidence", "").strip().lower() not in VIIRS_CONFIDENCE_ACCEPTED:
            return None
    return sensor


def department_for_point(point: Point, tree: STRtree, departments: list[dict]) -> dict | None:
    matches = []
    for index in tree.query(point):
        department = departments[int(index)]
        if department["polygon"].covers(point):
            matches.append(department)
    if not matches:
        return None
    return min(matches, key=lambda department: department["id"])


def macroregion_for_cell(gy: int, gx: int, tree: STRtree, departments: list[dict], cache: dict) -> str | None:
    key = gy, gx
    if key in cache:
        return cache[key]
    cell = box(gx * GRID_DEG, gy * GRID_DEG, (gx + 1) * GRID_DEG, (gy + 1) * GRID_DEG)
    overlaps = []
    for index in tree.query(cell):
        department = departments[int(index)]
        area = department["polygon"].intersection(cell).area
        if area > 0:
            overlaps.append((area, department["id"], department["macroregion"]))
    result = max(overlaps, key=lambda item: (item[0], item[1]))[2] if overlaps else None
    cache[key] = result
    return result


def write_observations(destination: Path, departments: list[dict]) -> tuple[int, list[str], dict[str, int]]:
    tree = STRtree([department["polygon"] for department in departments])
    cell_regions = {}
    files = sorted(RAW_DIR.glob("*.csv"))
    if not files:
        raise FileNotFoundError("No hay CSV FIRMS en data/raw. Ejecuta scripts/download_peru_sources.py.")
    rows_written = 0
    sources = []
    counts = {region: 0 for region in MACROREGION_NAMES}
    with destination.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["gy", "gx", "acq_date", "sensor", "region"])
        for path in files:
            filename = path.name.lower()
            if not (filename.startswith("modis_") or filename.startswith("viirs-") or "noaa20" in filename or "noaa21" in filename):
                continue
            sources.append(path.name)
            with path.open(encoding="utf-8-sig", newline="") as source:
                reader = csv.DictReader(source)
                required = {"latitude", "longitude", "acq_date", "type", "confidence"}
                fields = {str(column).strip().lower() for column in (reader.fieldnames or [])}
                if not required.issubset(fields):
                    raise ValueError(f"Columnas FIRMS incompletas en {path.name}.")
                for row in reader:
                    normalized = {str(key).strip().lower(): value or "" for key, value in row.items()}
                    sensor = accepted_row(path, normalized)
                    if sensor is None:
                        continue
                    try:
                        lat = float(normalized["latitude"])
                        lon = float(normalized["longitude"])
                        date = normalized["acq_date"][:10]
                        acquired = datetime.strptime(date, "%Y-%m-%d")
                    except (TypeError, ValueError):
                        continue
                    if not MIN_YEAR <= acquired.year <= MAX_YEAR:
                        continue
                    point = Point(lon, lat)
                    department = department_for_point(point, tree, departments)
                    if department is None:
                        continue
                    gy = math.floor(lat / GRID_DEG)
                    gx = math.floor(lon / GRID_DEG)
                    macroregion = macroregion_for_cell(gy, gx, tree, departments, cell_regions)
                    if macroregion is None:
                        macroregion = department["macroregion"]
                    writer.writerow([gy, gx, date, sensor, macroregion])
                    rows_written += 1
                    counts[macroregion] += 1
            print(f"Filtrado Perú: {path.name}")
    if not sources:
        raise FileNotFoundError("No se encontraron CSV MODIS o VIIRS reconocidos en data/raw.")
    return rows_written, sources, counts


def write_map(observations_file: Path) -> tuple[int, int]:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    final_path = PROCESSED_DIR / "map.parquet"
    observations = observations_file.resolve().as_posix().replace("'", "''")
    with tempfile.TemporaryDirectory(prefix="firechronos_map_", dir=PROCESSED_DIR) as temporary:
        temporary_path = (Path(temporary) / "map.parquet").resolve()
        destination = temporary_path.as_posix().replace("'", "''")
        sql = f"""
        COPY (
            WITH hits AS (
                SELECT DISTINCT
                    CAST(gy AS INTEGER) AS gy,
                    CAST(gx AS INTEGER) AS gx,
                    CAST(acq_date AS DATE) AS acq_date,
                    sensor,
                    region
                FROM read_csv('{observations}', header=true, all_varchar=true)
            ), monthly AS (
                SELECT
                    gy,
                    gx,
                    region,
                    year(acq_date) AS year,
                    month(acq_date) AS month,
                    count(DISTINCT acq_date) FILTER (WHERE sensor = 'terra') AS raw_terra,
                    count(DISTINCT acq_date) FILTER (WHERE sensor = 'aqua') AS raw_aqua,
                    count(DISTINCT acq_date) FILTER (WHERE sensor IN ('terra', 'aqua')) AS raw_modis,
                    count(DISTINCT acq_date) FILTER (WHERE sensor = 'viirs') AS raw_viirs
                FROM hits
                GROUP BY gy, gx, region, year, month
            )
            SELECT
                (gy + 0.5) * {GRID_DEG} AS lat,
                (gx + 0.5) * {GRID_DEG} AS lon,
                region,
                year,
                month,
                raw_terra,
                raw_aqua,
                raw_modis,
                raw_viirs,
                CAST(NULL AS DOUBLE) AS estimated,
                CAST(NULL AS DOUBLE) AS size_ratio
            FROM monthly
            ORDER BY year, month, region, lat, lon
        ) TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
        with duckdb.connect() as connection:
            connection.execute(sql)
            rows, years = connection.execute(
                f"SELECT count(*), count(DISTINCT year) FROM read_parquet('{destination}')"
            ).fetchone()
        temporary_path.replace(final_path)
    return rows, years


def main() -> None:
    departments = load_departments()
    write_regions(departments)
    with tempfile.TemporaryDirectory(prefix="firechronos_peru_") as temporary:
        observations = Path(temporary) / "observations.csv"
        raw_count, sources, region_counts = write_observations(observations, departments)
        map_rows, years = write_map(observations)
    print(f"Regiones: Perú, {len(MACROREGION_NAMES)} macrorregiones y {len(departments)} unidades departamentales.")
    print(f"Datos fuente: {len(sources)} archivos; observaciones filtradas: {raw_count}.")
    print(f"Observaciones por macrorregión: {region_counts}.")
    print(f"Parquet: data/processed/map.parquet; {map_rows} celdas-mes en {years} años.")
    print("estimated queda en null hasta que T2 entregue las estimaciones.")


if __name__ == "__main__":
    main()
