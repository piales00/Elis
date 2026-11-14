from time import perf_counter

import duckdb

import config
from regions import assign_regions


def build_cells(con, all_types=False):
    con.execute("""
        CREATE TEMP TABLE filtered_detections AS
        SELECT lower(satellite) AS sensor,
            latitude::DOUBLE AS lat, longitude::DOUBLE AS lon,
            acq_date::DATE AS date, frp::DOUBLE AS frp,
            brightness::DOUBLE AS brightness, scan::DOUBLE AS scan,
            track::DOUBLE AS track, daynight, version,
            ((acq_time::INTEGER // 100 * 60 + acq_time::INTEGER % 100
                + longitude::DOUBLE * 4) % 1440 + 1440) % 1440 AS lst_min
        FROM read_csv(?, all_varchar=true, union_by_name=true)
        WHERE (? OR type::INTEGER = ?) AND confidence::INTEGER >= ?
            AND satellite IN ('Aqua', 'Terra')
            AND year(acq_date::DATE) BETWEEN ? AND ?
            AND (satellite <> 'Aqua' OR acq_date::DATE >= ?)
        UNION ALL
        SELECT 'snpp' AS sensor,
            latitude::DOUBLE AS lat, longitude::DOUBLE AS lon,
            acq_date::DATE AS date, frp::DOUBLE AS frp,
            bright_ti4::DOUBLE AS brightness, scan::DOUBLE AS scan,
            track::DOUBLE AS track, daynight, version,
            ((acq_time::INTEGER // 100 * 60 + acq_time::INTEGER % 100
                + longitude::DOUBLE * 4) % 1440 + 1440) % 1440 AS lst_min
        FROM read_csv(?, all_varchar=true, union_by_name=true)
        WHERE (? OR type::INTEGER = ?) AND confidence IN (SELECT unnest(?))
            AND year(acq_date::DATE) BETWEEN ? AND ?
            AND acq_date::DATE >= ?
    """, [
        str(config.RAW_DIR / f"modis_*_{config.COUNTRY}.csv"),
        all_types, config.FIRE_TYPE, config.MODIS_MIN_CONFIDENCE,
        config.FIRST_YEAR, config.LAST_YEAR, config.AQUA_START,
        str(config.RAW_DIR / f"viirs-snpp_*_{config.COUNTRY}.csv"),
        all_types, config.FIRE_TYPE, list(config.VIIRS_CONFIDENCE),
        config.FIRST_YEAR, config.LAST_YEAR, config.VIIRS_START,
    ])
    con.execute("""
        CREATE TEMP TABLE cells AS
        WITH gridded AS (
            SELECT *, floor(lat / ?)::INTEGER AS cell_y,
                floor(lon / ?)::INTEGER AS cell_x
            FROM filtered_detections
        )
        SELECT sensor, cell_y, cell_x,
            (cell_y + 0.5) * ? AS lat, (cell_x + 0.5) * ? AS lon,
            date, year(date)::INTEGER AS year, month(date)::INTEGER AS month,
            count(*) AS n_points, sum(frp) AS frp_sum, max(frp) AS frp_max,
            max(brightness) AS bright_max,
            avg(scan) AS scan_mean, avg(track) AS track_mean,
            bool_or(daynight = 'D') AS has_day,
            bool_or(daynight = 'N') AS has_night,
            mode(version ORDER BY version) AS version,
            median(lst_min) FILTER (WHERE daynight = 'D') AS day_lst_min,
            median(lst_min) FILTER (WHERE daynight = 'N') AS night_lst_min
        FROM gridded
        GROUP BY sensor, cell_y, cell_x, date
    """, [config.GRID_DEG] * 4)
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
                has_day, has_night, version, day_lst_min, night_lst_min
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
    print("Cell-days by sensor and year:")
    print("year\taqua\tterra\tsnpp")
    for row in con.execute("""
        SELECT year,
            count(*) FILTER (WHERE sensor = 'aqua'),
            count(*) FILTER (WHERE sensor = 'terra'),
            count(*) FILTER (WHERE sensor = 'snpp')
        FROM cells GROUP BY year ORDER BY year
    """).fetchall():
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
