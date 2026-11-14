import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request

import duckdb

from config import FIRST_YEAR, HISTORY_YEARS, INTERIM_DIR, NATIONAL


EXTERNAL_DIR = INTERIM_DIR.parent / "external" / "mapbiomas"
OUTPUT_PATH = INTERIM_DIR / "mapbiomas.parquet"
REQUEST_PAUSE_SECONDS = 0.3
REQUEST_TIMEOUT_SECONDS = 60
REQUEST_ATTEMPTS = 2
TASK_POLL_SECONDS = 3
TASK_POLL_ATTEMPTS = 120
HEADERS = {"Accept": "application/json", "User-Agent": "FireChronos/1.0", "tenant-id": "mapbiomas"}
BIOME_REGION_APPROXIMATION = {
    "16-4-4": "amazonia",
    "16-4-1": "sierra",
    "16-4-3": "costa",
    "16-4-2": "costa",
}


def request_json(url, path):
    for attempt in range(REQUEST_ATTEMPTS):
        time.sleep(REQUEST_PAUSE_SECONDS)
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                raw = response.read()
            payload = json.loads(raw)
            path.write_bytes(raw)
            return payload
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            if attempt + 1 == REQUEST_ATTEMPTS:
                raise
            print(f"Retry: {path.name}: {error}", flush=True)
            time.sleep(TASK_POLL_SECONDS)


def build_url(period, territory):
    template = (EXTERNAL_DIR / f"{period}_request.txt").read_text().strip()
    parts = urllib.parse.urlsplit(template)
    query = urllib.parse.parse_qsl(parts.query)
    replacements = {"territoryId": territory["id"], "territoryCategoryId": str(territory["categoryId"])}
    query = [(key, replacements.get(key, value)) for key, value in query]
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(query)))


def load_statistics(period, territory):
    stem = f"{period}_{territory['id']}"
    path = EXTERNAL_DIR / f"{stem}.json"
    result_path = EXTERNAL_DIR / f"{stem}_result.json"
    url = build_url(period, territory)
    if result_path.exists():
        payload = json.loads(result_path.read_bytes())
    elif path.exists():
        payload = json.loads(path.read_bytes())
    else:
        payload = request_json(url, path)
        print(f"Downloaded: {path.name}", flush=True)
    if "statistic" in payload:
        return payload
    task_id = payload.get("taskID")
    if isinstance(task_id, list):
        task_id = task_id[0]
    if not task_id:
        raise ValueError(f"Unexpected API response: {payload}")
    task_url = url.split("/statistics/")[0] + f"/statistics/task/{task_id}"
    for poll in range(TASK_POLL_ATTEMPTS):
        status_path = EXTERNAL_DIR / f"{stem}_task_{task_id}_{time.time_ns()}.json"
        status = request_json(task_url, status_path)
        if status.get("status") in ("failed", "aborted"):
            raise ValueError(f"Task {task_id}: {status}")
        if status.get("status") in ("success", "exported"):
            payload = request_json(url, result_path)
            if "statistic" in payload:
                print(f"Resolved: {result_path.name}", flush=True)
                return payload
        time.sleep(TASK_POLL_SECONDS)
    raise TimeoutError(f"Task {task_id} did not return statistics")


def parse_rows(payload, period, territory, level):
    if payload.get("unit") != "ha" or payload.get("statMethod") != "sum":
        raise ValueError("Expected summed burned area in hectares")
    rows = []
    years = set()
    for entry in payload["statistic"]:
        if len(entry["year"]) != 1:
            raise ValueError("Expected one year per statistic")
        year = int(entry["year"][0])
        if not FIRST_YEAR <= year <= HISTORY_YEARS[1]:
            continue
        if year in years:
            raise ValueError(f"Duplicate year: {year}")
        years.add(year)
        region = NATIONAL if level == "country" else BIOME_REGION_APPROXIMATION.get(territory["id"])
        prefix = (territory["id"], territory["name"], level, region, year)
        values = [(None, entry["total"])] if period == "annual" else [
            (int(item["pixelValue"]), item["value"]) for item in entry["items"]
        ]
        if period == "monthly" and sorted(month for month, value in values) != list(range(1, 13)):
            raise ValueError(f"Incomplete or duplicate months: {year}")
        for month, value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError(f"Invalid burned area: {year}, {month}, {value}")
            rows.append((*prefix, month, float(value)))
    expected_years = set(range(FIRST_YEAR, HISTORY_YEARS[1] + 1))
    missing_years = sorted(expected_years - years)
    if missing_years:
        print(f"MISSING: {period} {territory['name']}: {missing_years}; burned_ha kept as NULL", flush=True)
        region = NATIONAL if level == "country" else BIOME_REGION_APPROXIMATION.get(territory["id"])
        for year in missing_years:
            for month in ([None] if period == "annual" else range(1, 13)):
                rows.append((territory["id"], territory["name"], level, region, year, month, None))
    return rows


def print_summary(connection, failures):
    print("Biome-to-region mapping is an approximation; departments have no assigned region.")
    print("Units: MapBiomas burned area (ha), independent of fire cell-days.")
    print(connection.sql("SELECT count(*) AS rows, min(year) AS first_year, max(year) AS last_year FROM burned_area"))
    connection.sql("""
        WITH biomes AS (
            SELECT year, sum(burned_ha) AS biome_ha, count(*) AS biome_count
            FROM burned_area WHERE level = 'biome' AND month IS NULL GROUP BY year
        )
        SELECT c.year, c.burned_ha AS national_ha, b.biome_ha, b.biome_count,
               CASE WHEN b.biome_count = 4 THEN
                   100 * (b.biome_ha - c.burned_ha) / nullif(c.burned_ha, 0)
               END AS difference_pct
        FROM burned_area c LEFT JOIN biomes b USING (year)
        WHERE c.level = 'country' AND c.month IS NULL ORDER BY c.year
    """).show(max_rows=HISTORY_YEARS[1] - FIRST_YEAR + 1)
    connection.sql("""
        SELECT territory_id, territory_name, year,
               count(*) FILTER (WHERE month IS NULL) AS missing_annual,
               count(*) FILTER (WHERE month IS NOT NULL) AS missing_months
        FROM burned_area WHERE burned_ha IS NULL
        GROUP BY territory_id, territory_name, year ORDER BY territory_id, year
    """).show(max_rows=100)
    print(f"Failed territory-periods: {len(failures)}")
    for failure in failures:
        print(failure)


def main():
    territories = [({"id": "16-1-1", "name": "Perú", "categoryId": 1}, "country")]
    for filename, level, expected_count in (("biomes.json", "biome", 4), ("departments.json", "department", 25)):
        entries = json.loads((EXTERNAL_DIR / filename).read_bytes())["territories"]
        if len(entries) != expected_count or len({entry["id"] for entry in entries}) != expected_count:
            raise ValueError(f"Expected {expected_count} unique territories in {filename}")
        territories.extend((entry, level) for entry in entries)
    rows = []
    failures = []
    for territory, level in territories:
        for period in ("annual", "monthly"):
            path = EXTERNAL_DIR / f"{period}_{territory['id']}.json"
            if not path.exists():
                try:
                    request_json(build_url(period, territory), path)
                    print(f"Downloaded: {path.name}", flush=True)
                except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
                    print(f"Initial request failed: {path.name}: {error}", flush=True)
    for territory, level in territories:
        for period in ("annual", "monthly"):
            try:
                payload = load_statistics(period, territory)
                records = parse_rows(payload, period, territory, level)
                rows.extend(records)
                print(f"Loaded: {period} {territory['name']}: {len(records)} rows", flush=True)
            except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, TypeError) as error:
                failure = f"{period} {territory['id']} {territory['name']}: {error}"
                failures.append(failure)
                print(f"FAILED: {failure}", flush=True)
    connection = duckdb.connect()
    connection.execute("""
        CREATE TABLE burned_area (
            territory_id VARCHAR, territory_name VARCHAR, level VARCHAR, region VARCHAR,
            year INTEGER, month INTEGER, burned_ha DOUBLE
        )
    """)
    if rows:
        connection.executemany("INSERT INTO burned_area VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    temporary_path = OUTPUT_PATH.with_suffix(".parquet.tmp")
    connection.execute("COPY (SELECT * FROM burned_area ORDER BY level, territory_id, year, month NULLS FIRST) TO ? (FORMAT PARQUET)", [str(temporary_path)])
    temporary_path.replace(OUTPUT_PATH)
    print_summary(connection, failures)
    connection.close()
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
