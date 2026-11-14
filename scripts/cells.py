import json
from time import perf_counter

import duckdb

import config
from regions import assign_regions


SENSORS = ("aqua", "terra", "snpp", "noaa20", "noaa21")
OPTIONAL_COLUMNS = ("type", "brightness", "bright_ti4")
MASK_NAME = "static_mask.parquet"
MASK_VALIDATION_NAME = "static_mask_validation.json"


def source_files():
    extra = config.RAW_2026_DIR if config.RAW_2026_DIR.is_dir() else None
    modis = sorted(config.RAW_DIR.glob(f"modis_*_{config.COUNTRY}.csv"))
    viirs = sorted(config.RAW_DIR.glob(f"viirs-snpp_*_{config.COUNTRY}.csv"))
    if extra is not None:
        modis += sorted(extra.glob("modis_*.csv"))
        viirs += sorted(extra.glob("viirs-*.csv"))
    return [str(path) for path in modis], [str(path) for path in viirs]


def load_raw(con, name, files):
    con.execute(f"CREATE TEMP TABLE {name} AS SELECT * FROM read_csv(?, all_varchar=true, union_by_name=true)", [files])
    for column in OPTIONAL_COLUMNS:
        con.execute(f"ALTER TABLE {name} ADD COLUMN IF NOT EXISTS {column} VARCHAR")


def load_detections(con):
    modis, viirs = source_files()
    load_raw(con, "raw_modis", modis)
    load_raw(con, "raw_viirs", viirs)
    columns = """
        latitude::DOUBLE AS lat, longitude::DOUBLE AS lon,
        floor(latitude::DOUBLE / {grid})::INTEGER AS cell_y,
        floor(longitude::DOUBLE / {grid})::INTEGER AS cell_x,
        acq_date::DATE AS date, frp::DOUBLE AS frp, scan::DOUBLE AS scan,
        track::DOUBLE AS track, daynight, version, type::INTEGER AS type,
        CASE WHEN upper(version) LIKE '%NRT' THEN 'nrt' ELSE 'sp' END AS processing,
        ((acq_time::INTEGER // 100 * 60 + acq_time::INTEGER % 100
            + longitude::DOUBLE * 4) % 1440 + 1440) % 1440 AS lst_min
    """.format(grid=config.GRID_DEG)
    con.execute(f"""
        CREATE TEMP TABLE detections AS
        SELECT 'modis' AS instrument, lower(satellite) AS sensor, {columns},
            brightness::DOUBLE AS brightness, confidence::INTEGER >= ? AS confident
        FROM raw_modis WHERE satellite IN ('Aqua', 'Terra')
        UNION ALL
        SELECT 'viirs' AS instrument,
            CASE satellite WHEN 'N20' THEN 'noaa20' WHEN 'N21' THEN 'noaa21' ELSE 'snpp' END AS sensor,
            {columns}, coalesce(bright_ti4, brightness)::DOUBLE AS brightness,
            confidence IN (SELECT unnest(?)) AS confident
        FROM raw_viirs WHERE satellite IN ('N', 'SNPP', 'N20', 'N21')
    """, [config.MODIS_MIN_CONFIDENCE, list(config.VIIRS_CONFIDENCE)])
    con.execute("DROP TABLE raw_modis")
    con.execute("DROP TABLE raw_viirs")
    missing = con.execute("SELECT count(*) FROM detections WHERE processing = 'sp' AND type IS NULL").fetchone()[0]
    if missing:
        raise ValueError(f"{missing} standard-processing detections lack the type column.")


def build_static_mask(con):
    con.execute("""
        CREATE TEMP TABLE static_mask AS
        SELECT instrument, cell_y, cell_x, count(*) AS n_detections,
            count(*) FILTER (WHERE type <> ?) AS n_static,
            count(*) FILTER (WHERE type <> ?) / count(*) AS static_share
        FROM detections
        WHERE processing = 'sp' AND confident AND year(date) BETWEEN ? AND ?
        GROUP BY instrument, cell_y, cell_x
        HAVING count(*) >= ? AND count(*) FILTER (WHERE type <> ?) / count(*) >= ?
    """, [config.FIRE_TYPE, config.FIRE_TYPE, *config.STATIC_MASK_YEARS,
          config.STATIC_MIN_DETECTIONS, config.FIRE_TYPE, config.STATIC_MIN_SHARE])
    con.execute("""
        CREATE TEMP TABLE masked_detections AS
        SELECT d.*, m.cell_y IS NOT NULL AS masked
        FROM detections d LEFT JOIN static_mask m USING (instrument, cell_y, cell_x)
    """)
    con.execute("DROP TABLE detections")


def mask_report(con):
    cells = dict(con.execute("SELECT instrument, count(*) FROM static_mask GROUP BY 1").fetchall())
    validation = [dict(zip(("period", "instrument", "sensor", "static_total", "static_removed",
                            "vegetation_total", "vegetation_removed"), row)) for row in con.execute("""
        SELECT CASE WHEN year(date) = ? THEN CAST(year(date) AS VARCHAR) ELSE ? END AS period,
            instrument, sensor,
            count(*) FILTER (WHERE type <> ?), count(*) FILTER (WHERE type <> ? AND masked),
            count(*) FILTER (WHERE type = ?), count(*) FILTER (WHERE type = ? AND masked)
        FROM masked_detections
        WHERE processing = 'sp' AND confident AND (year(date) BETWEEN ? AND ? OR year(date) = ?)
        GROUP BY ALL ORDER BY ALL
    """, [config.SNPP_END.year, f"{config.STATIC_VALIDATION_YEARS[0]}-{config.STATIC_VALIDATION_YEARS[1]}",
          *[config.FIRE_TYPE] * 4, *config.STATIC_VALIDATION_YEARS, config.SNPP_END.year]).fetchall()]
    for row in validation:
        row["static_removed_pct"] = 100 * row["static_removed"] / row["static_total"] if row["static_total"] else None
        row["vegetation_removed_pct"] = 100 * row["vegetation_removed"] / row["vegetation_total"] if row["vegetation_total"] else None
    nrt = [dict(zip(("sensor", "nrt_detections", "nrt_removed"), row)) for row in con.execute("""
        SELECT sensor, count(*), count(*) FILTER (WHERE masked) FROM masked_detections
        WHERE processing = 'nrt' AND confident GROUP BY ALL ORDER BY ALL
    """).fetchall()]
    return {
        "rule": "0.1 degree cells where, in standard-processing detections of the same instrument passing the confidence filter "
                "in mask_years, at least min_share have type != fire_type and there are at least min_detections detections. "
                "Applied only to NRT detections, which have no type column.",
        "mask_years": config.STATIC_MASK_YEARS, "validation_years": config.STATIC_VALIDATION_YEARS,
        "min_share": config.STATIC_MIN_SHARE, "min_detections": config.STATIC_MIN_DETECTIONS,
        "fire_type": config.FIRE_TYPE, "cells": cells, "validation": validation, "nrt_removed": nrt,
        "note": "Validation years inside mask_years are in-sample; the standard-processing months of the last year are out of sample.",
    }


def build_cells(con, all_types=False):
    load_detections(con)
    build_static_mask(con)
    report = mask_report(con)
    con.execute("""
        CREATE TEMP TABLE filtered_detections AS
        SELECT * FROM masked_detections
        WHERE confident AND year(date) BETWEEN ? AND ? AND date <= ?
            AND (sensor <> 'aqua' OR date >= ?)
            AND (sensor <> 'snpp' OR date BETWEEN ? AND ?)
            AND (? OR (processing = 'sp' AND type = ?) OR (processing = 'nrt' AND NOT masked))
    """, [config.FIRST_YEAR, config.LAST_YEAR, config.LAST_DATA_DATE, config.AQUA_START,
          config.VIIRS_START, config.SNPP_END, all_types, config.FIRE_TYPE])
    con.execute("DROP TABLE masked_detections")
    con.execute("""
        CREATE TEMP TABLE cells AS
        SELECT sensor, cell_y, cell_x,
            (cell_y + 0.5) * ? AS lat, (cell_x + 0.5) * ? AS lon,
            date, year(date)::INTEGER AS year, month(date)::INTEGER AS month,
            count(*) AS n_points, sum(frp ORDER BY frp) AS frp_sum, max(frp) AS frp_max,
            max(brightness) AS bright_max,
            avg(scan ORDER BY scan) AS scan_mean, avg(track ORDER BY track) AS track_mean,
            bool_or(daynight = 'D') AS has_day,
            bool_or(daynight = 'N') AS has_night,
            mode(version ORDER BY version) AS version,
            median(lst_min) FILTER (WHERE daynight = 'D') AS day_lst_min,
            median(lst_min) FILTER (WHERE daynight = 'N') AS night_lst_min,
            CASE WHEN bool_or(processing = 'nrt') THEN 'nrt' ELSE 'sp' END AS processing
        FROM filtered_detections
        GROUP BY sensor, cell_y, cell_x, date
    """, [config.GRID_DEG] * 2)
    con.execute("DROP TABLE filtered_detections")
    assign_regions(con, "cells")
    total, outside = con.execute("""
        SELECT coalesce(sum(n_points), 0),
            coalesce(sum(n_points) FILTER (WHERE region IS NULL), 0)
        FROM cells
    """).fetchone()
    outside_pct = 100 * outside / total if total else 0
    print(
        f"Outside Peru (cells without department overlap): {outside:,}/{total:,} "
        f"filtered detections ({outside_pct:.4f}%)"
    )
    con.execute("DELETE FROM cells WHERE region IS NULL")
    config.INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    suffix = "_alltypes" if all_types else ""
    cells_path = config.INTERIM_DIR / f"cells{suffix}.parquet"
    monthly_path = config.INTERIM_DIR / f"detections_monthly{suffix}.parquet"
    con.execute("""
        COPY (
            SELECT sensor, cell_y, cell_x, lat, lon, date, year, month, region,
                n_points, frp_sum, frp_max, bright_max, scan_mean, track_mean,
                has_day, has_night, version, day_lst_min, night_lst_min, processing
            FROM cells ORDER BY sensor, date, cell_y, cell_x
        ) TO ? (FORMAT PARQUET)
    """, [str(cells_path)])
    con.execute("""
        COPY (
            SELECT region, year, month, sensor, sum(n_points)::BIGINT AS n_detections
            FROM cells GROUP BY region, year, month, sensor
            ORDER BY region, year, month, sensor
        ) TO ? (FORMAT PARQUET)
    """, [str(monthly_path)])
    con.execute("""
        COPY (
            SELECT sensor, date, region, median(day_lst_min) AS day_lst_min,
                count(day_lst_min) AS n_cells
            FROM cells GROUP BY sensor, date, region
            ORDER BY sensor, date, region
        ) TO ? (FORMAT PARQUET)
    """, [str(config.INTERIM_DIR / f"overpass{suffix}.parquet")])
    if not all_types:
        con.execute("COPY (SELECT * FROM static_mask ORDER BY ALL) TO ? (FORMAT PARQUET)",
                    [str(config.INTERIM_DIR / MASK_NAME)])
        (config.INTERIM_DIR / MASK_VALIDATION_NAME).write_text(json.dumps(report, indent=2) + "\n")
    print(f"Static-source mask cells: {report['cells']}")
    for row in report["validation"]:
        print(f"Mask validation {row['period']} {row['sensor']}: static removed {row['static_removed']}/{row['static_total']}, "
              f"vegetation removed {row['vegetation_removed']}/{row['vegetation_total']}")
    for row in report["nrt_removed"]:
        print(f"NRT removed by mask {row['sensor']}: {row['nrt_removed']}/{row['nrt_detections']}")
    print("Cell-days by sensor and year:")
    print("year\t" + "\t".join(SENSORS))
    filters = ", ".join(f"count(*) FILTER (WHERE sensor = '{sensor}')" for sensor in SENSORS)
    for row in con.execute(f"SELECT year, {filters} FROM cells GROUP BY year ORDER BY year").fetchall():
        print("\t".join(str(value) for value in row))
    print(f"Created: {cells_path}")
    print(f"Created: {monthly_path}")


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--all-types", action="store_true")
    args = parser.parse_args()
    started = perf_counter()
    with duckdb.connect(config={
        "autoinstall_known_extensions": "false",
        "autoload_known_extensions": "false",
    }) as con:
        build_cells(con, all_types=args.all_types)
    print(f"Elapsed: {perf_counter() - started:.3f} seconds")


if __name__ == "__main__":
    main()
