import sys
from pathlib import Path
from time import perf_counter

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cells
import config
from regions import assign_regions


NOAA20_ARCHIVE = config.RAW_DIR / "noaa20" / "viirs-noaa20_2018-2025_archive.csv"
NOAA20_2026_ARCHIVE = config.RAW_2026_DIR / "viirs-noaa20_2026_archive.csv"
PLACEHOLDER_MODIS = config.RAW_DIR / f"modis_2000_{config.COUNTRY}.csv"
OUTPUT = config.INTERIM_DIR / "cells_three.parquet"
CHECK_COLUMNS = ("n_points", "frp_sum", "frp_max", "has_day", "has_night", "day_lst_min", "night_lst_min")


def build(con):
    cells.source_files = lambda: ([str(PLACEHOLDER_MODIS)], [str(NOAA20_ARCHIVE), str(NOAA20_2026_ARCHIVE)])
    cells.load_detections(con)
    con.execute("DELETE FROM detections WHERE sensor <> 'noaa20'")
    con.execute("""
        CREATE TEMP TABLE noaa20_cells AS
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
            'sp' AS processing
        FROM detections
        WHERE confident AND processing = 'sp' AND type = ? AND year(date) BETWEEN ? AND ? AND date <= ?
        GROUP BY sensor, cell_y, cell_x, date
    """, [config.GRID_DEG, config.GRID_DEG, config.FIRE_TYPE, config.FIRST_YEAR, config.LAST_YEAR,
          config.LAST_DATA_DATE])
    con.execute("DROP TABLE detections")
    assign_regions(con, "noaa20_cells")
    con.execute("DELETE FROM noaa20_cells WHERE region IS NULL")


def check_against_cells(con):
    mismatch = con.execute(f"""
        WITH mine AS (SELECT * FROM noaa20_cells WHERE year = ?),
        reference AS (
            SELECT * FROM read_parquet(?) WHERE sensor = 'noaa20' AND processing = 'sp'
        )
        SELECT count(*) FILTER (WHERE mine.cell_y IS NULL),
            count(*) FILTER (WHERE reference.cell_y IS NULL),
            count(*) FILTER (WHERE mine.cell_y IS NOT NULL AND reference.cell_y IS NOT NULL
                AND (mine.region <> reference.region OR {" OR ".join(
                    f"mine.{c} IS DISTINCT FROM reference.{c}" for c in CHECK_COLUMNS)})),
            count(*)
        FROM mine FULL JOIN reference USING (cell_y, cell_x, date)
    """, [config.LAST_YEAR, str(config.INTERIM_DIR / "cells.parquet")]).fetchone()
    print(f"Check vs cells.parquet NOAA-20 SP {config.LAST_YEAR}: only_reference={mismatch[0]}, "
          f"only_mine={mismatch[1]}, differing={mismatch[2]}, total={mismatch[3]}")
    if any(mismatch[:3]):
        raise ValueError("NOAA-20 cell-days differ from the main pipeline on the overlapping SP period.")


def main():
    started = perf_counter()
    with duckdb.connect(config={"autoinstall_known_extensions": "false",
                                "autoload_known_extensions": "false"}) as con:
        build(con)
        check_against_cells(con)
        con.execute("""
            COPY (
                SELECT sensor, cell_y, cell_x, lat, lon, date, year, month, region,
                    n_points, frp_sum, frp_max, bright_max, scan_mean, track_mean,
                    has_day, has_night, version, day_lst_min, night_lst_min, processing
                FROM noaa20_cells WHERE year < ? ORDER BY date, cell_y, cell_x
            ) TO ? (FORMAT PARQUET)
        """, [config.LAST_YEAR, str(OUTPUT)])
        for row in con.execute("SELECT year, count(*), min(date), max(date) FROM noaa20_cells GROUP BY 1 ORDER BY 1").fetchall():
            print(*row, sep="\t")
    print(f"Created: {OUTPUT} ({perf_counter() - started:.1f} s)")


if __name__ == "__main__":
    main()
