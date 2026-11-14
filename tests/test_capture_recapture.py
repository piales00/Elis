import math
from pathlib import Path
import sys

import duckdb
import numpy as np
import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import config
from capture_recapture import chapman, chapman_ci, chapman_var


def simulate_counts(rng, population, probabilities):
    both, first_only, second_only, _ = rng.multinomial(
        population, probabilities, size=config.TEST_REPLICATES
    ).T
    return zip(first_only + both, second_only + both, both)


@pytest.mark.parametrize("p1,p2", [(0.2, 0.2), (0.2, 0.9), (0.5, 0.7), (0.9, 0.9)])
def test_independent_recovery_and_coverage(p1, p2, record_property):
    population = 2000
    rng = np.random.default_rng(config.SEED)
    probabilities = [p1 * p2, p1 * (1 - p2), (1 - p1) * p2, (1 - p1) * (1 - p2)]
    estimates = []
    covered = []
    for n1, n2, m in simulate_counts(rng, population, probabilities):
        estimate = chapman(int(n1), int(n2), int(m))
        low, high = chapman_ci(int(n1), int(n2), int(m), config.CI_LEVEL)
        assert n1 + n2 - m <= low <= estimate <= high
        estimates.append(estimate)
        covered.append(low <= population <= high)
    relative_bias = float(np.mean(estimates) / population - 1)
    coverage = float(np.mean(covered))
    record_property("relative_bias", relative_bias)
    record_property("coverage", coverage)
    print(f"Independent p1={p1}, p2={p2}: bias={relative_bias:.6%}, coverage={coverage:.3%}")
    assert abs(relative_bias) <= config.TEST_MAX_REL_BIAS
    assert coverage >= config.TEST_MIN_COVERAGE


@pytest.mark.parametrize("n1,n2,m", [(12, 20, 0), (0, 20, 0), (0, 0, 0), (20, 20, 20), (12, 20, 7)])
def test_formulas_and_boundary_intervals(n1, n2, m):
    expected = (n1 + 1) * (n2 + 1) / (m + 1) - 1
    variance = (n1 + 1) * (n2 + 1) * (n1 - m) * (n2 - m) / ((m + 1) ** 2 * (m + 2))
    assert chapman(n1, n2, m) == pytest.approx(expected)
    assert chapman_var(n1, n2, m) == pytest.approx(variance)
    low, high = chapman_ci(n1, n2, m, config.CI_LEVEL)
    assert not math.isnan(low) and not math.isnan(high)
    assert n1 + n2 - m <= low <= expected <= high
    if m == n1 == n2:
        assert (low, high) == pytest.approx((expected, expected))


def test_correlated_detection_underestimates(record_property):
    population = 2000
    small_probability, large_probability = 0.2, 0.9
    large_fraction = 0.5
    joint = (1 - large_fraction) * small_probability**2 + large_fraction * large_probability**2
    marginal = (1 - large_fraction) * small_probability + large_fraction * large_probability
    probabilities = [joint, marginal - joint, marginal - joint, 1 - 2 * marginal + joint]
    estimates = [
        chapman(int(n1), int(n2), int(m))
        for n1, n2, m in simulate_counts(np.random.default_rng(config.SEED), population, probabilities)
    ]
    relative_bias = float(np.mean(estimates) / population - 1)
    record_property("correlated_relative_bias", relative_bias)
    print(f"Correlated detection: bias={relative_bias:.6%}")
    assert relative_bias < -config.TEST_MAX_REL_BIAS


@pytest.mark.parametrize("years", [config.CALIBRATION_YEARS, *config.TEST_SPLIT_DRIFT])
def test_real_cell_day_intervals(years):
    excluded = [
        (start, end)
        for schedule in (config.OUTAGES, config.DEGRADED)
        for sensor in ("aqua", "snpp")
        for start, end in schedule.get(sensor, [])
    ]
    with duckdb.connect(config={"autoinstall_known_extensions": "false", "autoload_known_extensions": "false"}) as con:
        con.execute("CREATE TEMP TABLE excluded (start_date DATE, end_date DATE)")
        con.executemany("INSERT INTO excluded VALUES (?, ?)", excluded)
        rows = con.execute(
            """
            WITH paired AS (
                SELECT region, year, month, cell_y, cell_x, date,
                    bool_or(sensor = 'aqua') AS first_seen,
                    bool_or(sensor = 'snpp') AS second_seen
                FROM read_parquet(?) AS cells
                WHERE sensor IN ('aqua', 'snpp') AND year BETWEEN ? AND ?
                    AND NOT EXISTS (
                        SELECT 1 FROM excluded
                        WHERE cells.date BETWEEN start_date AND end_date
                    )
                GROUP BY region, year, month, cell_y, cell_x, date
            )
            SELECT count(*) FILTER (WHERE first_seen),
                count(*) FILTER (WHERE second_seen),
                count(*) FILTER (WHERE first_seen AND second_seen)
            FROM paired GROUP BY region, year, month
            """,
            [str(config.INTERIM_DIR / "cells.parquet"), *years],
        ).fetchall()
    assert rows
    for n1, n2, m in rows:
        estimate = chapman(n1, n2, m)
        variance = chapman_var(n1, n2, m)
        low, high = chapman_ci(n1, n2, m, config.CI_LEVEL)
        assert math.isfinite(estimate) and math.isfinite(variance)
        assert variance >= 0
        assert n1 + n2 - m <= low <= estimate <= high


@pytest.mark.parametrize("first,second,expected", [
    (800, 800, True),
    (800, 800 + config.SIMULTANEOUS_MAX_MINUTES - 0.001, True),
    (800, 800 + config.SIMULTANEOUS_MAX_MINUTES, False),
    (800 + config.SIMULTANEOUS_MAX_MINUTES, 800, False),
    (None, 800, False), (800, None, False),
    (None, None, False), (float("nan"), 800, False),
])
def test_simultaneous_boundary_and_missing_times(first, second, expected):
    from capture_recapture import simultaneous

    assert simultaneous(first, second) is expected


def test_bridge_recovers_aqua_with_unequal_annual_counts():
    from capture_recapture import bridge_ratio

    terra = np.array([10, 20, 100, 40])
    aqua = terra * 1.7
    ratio = bridge_ratio(float(aqua.sum()), float(terra.sum()))
    assert ratio == pytest.approx(1.7)
    assert 35 * ratio == pytest.approx(59.5)
    with pytest.raises(ValueError):
        bridge_ratio(10, 0)
    with pytest.raises(ValueError):
        bridge_ratio(-1, 10)


def test_local_solar_time_and_legacy_cell_columns(tmp_path, monkeypatch):
    import cells

    monkeypatch.setattr(config, "RAW_DIR", tmp_path)
    monkeypatch.setattr(config, "RAW_2026_DIR", tmp_path / "2026")
    monkeypatch.setattr(config, "INTERIM_DIR", tmp_path / "interim")
    def assign(con, table):
        con.execute(f"ALTER TABLE {table} ADD COLUMN region VARCHAR DEFAULT 'amazonia'")
    monkeypatch.setattr(cells, "assign_regions", assign)
    header = "satellite,latitude,longitude,acq_date,acq_time,frp,brightness,scan,track,daynight,version,type,confidence\n"
    (tmp_path / "modis_test_Peru.csv").write_text(header +
        "Aqua,-5.01,-75.01,2015-08-01,1830,10,320,1,1,D,61,0,80\n" +
        "Aqua,-5.01,-75.01,2015-08-01,1850,20,330,2,2,D,61,0,80\n" +
        "Aqua,-5.01,-75.01,2015-08-01,0100,5,310,1,1,N,61,0,80\n")
    (tmp_path / "viirs-snpp_test_Peru.csv").write_text(header.replace("brightness", "bright_ti4") +
        "N,-5.01,-75.01,2015-08-01,1835,7,310,.4,.4,D,2,0,n\n" +
        "N,-5.01,-75.01,2015-08-02,0630,4,310,.4,.4,N,2,0,n\n")
    with duckdb.connect() as con:
        cells.build_cells(con)
        row = con.execute("SELECT n_points, frp_sum, frp_max, has_day, has_night, day_lst_min, night_lst_min FROM cells WHERE sensor='aqua'").fetchone()
        assert row[:5] == (3, 35, 20, True, True)
        assert row[5:] == pytest.approx((819.96, 1199.96))
        overpasses = con.execute("SELECT sensor, date, day_lst_min, n_cells FROM read_parquet(?) ORDER BY sensor,date", [str(config.INTERIM_DIR / "overpass.parquet")]).fetchall()
        assert overpasses[0][2:] == pytest.approx((819.96, 1))
        assert overpasses[-1][2:] == (None, 0)


def test_real_corrected_estimates_and_bootstrap_aggregation():
    with duckdb.connect() as con:
        con.execute("CREATE TEMP TABLE e AS SELECT * FROM read_parquet(?)", [str(config.INTERIM_DIR / "estimates.parquet")])
        con.execute("CREATE TEMP TABLE p AS SELECT * FROM read_parquet(?)", [str(config.INTERIM_DIR / "detection_probs.parquet")])
        assert con.execute("SELECT count(*) FROM p WHERE sensor_pair <> 'aqua_snpp'").fetchone()[0] == 0
        assert con.execute("SELECT count(*) FROM e WHERE NOT (est_low <= estimated AND estimated <= est_high) OR NOT isfinite(estimated)").fetchone()[0] == 0
        assert con.execute("SELECT count(*) FROM e WHERE year >= ? AND source <> 'viirs_only'", [config.DRIFT_START_YEAR]).fetchone()[0] == 0
        failures = con.execute("""
            SELECT count(*) FROM read_parquet(?) s JOIN p USING (region,month)
            WHERE (mode IN ('both','snpp') AND abs(estimated - s.n2/p2) > 1e-8)
                OR (mode='aqua' AND abs(estimated - s.n1/p1) > 1e-8)
                OR (mode='both' AND abs(chapman_direct - ((s.n1+1.0)*(s.n2+1)/(s.m+1)-1)) > 1e-8)
        """, [str(config.INTERIM_DIR / "capture_segments.parquet")]).fetchone()[0]
        assert failures == 0
        delta = con.execute("""
            WITH totals AS (
                SELECT year, month, replicate,
                    sum(estimated) FILTER (WHERE region <> ?) AS regional,
                    max(estimated) FILTER (WHERE region = ?) AS national
                FROM read_parquet(?) GROUP BY year,month,replicate
            ) SELECT max(abs(regional-national)) FROM totals
        """, [config.NATIONAL, config.NATIONAL, str(config.INTERIM_DIR / "estimate_replicates.parquet")]).fetchone()[0]
        assert delta < 1e-8


def test_real_terra_bridge_uses_training_only_and_combines_uncertainty():
    import json

    sensitivity = json.loads((config.INTERIM_DIR / "sensitivity.json").read_text())
    assert config.TERRA_BACKCAST_TEST_YEARS[1] < config.TERRA_BACKCAST_TRAIN_YEARS[0]
    with duckdb.connect() as con:
        for row in sensitivity["terra_backcast"]:
            counts = dict(con.execute("""
                SELECT month,
                    count(*) FILTER (WHERE sensor='aqua')::DOUBLE /
                    count(*) FILTER (WHERE sensor='terra')
                FROM read_parquet(?) WHERE region=? AND year BETWEEN ? AND ? GROUP BY month
            """, [str(config.INTERIM_DIR / "cells.parquet"), row["region"], *config.TERRA_BACKCAST_TRAIN_YEARS]).fetchall())
            for month in row["monthly"]:
                nt = con.execute("SELECT count(*) FROM read_parquet(?) WHERE region=? AND year=? AND month=? AND sensor='terra'", [str(config.INTERIM_DIR / "cells.parquet"), row["region"], month["year"], month["month"]]).fetchone()[0]
                assert month["predicted"] == pytest.approx(nt * counts[month["month"]])
        error = con.execute("""
            SELECT max(abs(e.estimated - s.n_terra * b.ratio / p.p1))
            FROM read_parquet(?) e
            JOIN read_parquet(?) s USING(region,year,month)
            JOIN read_parquet(?) b USING(region,month,replicate)
            JOIN read_parquet(?) p USING(region,month,replicate)
            WHERE s.mode='terra' AND make_date(e.year,e.month,1) < date_trunc('month', ?::DATE)
        """, [str(config.INTERIM_DIR / f) for f in ("estimate_replicates.parquet", "capture_segments.parquet", "terra_bridge_replicates.parquet", "detection_probability_replicates.parquet")] + [config.AQUA_START]).fetchone()[0]
        assert error < 1e-8


def test_real_calibration_uses_simultaneous_available_days_only():
    with duckdb.connect() as con:
        excluded = [(a, b) for schedule in (config.OUTAGES, config.DEGRADED)
                    for sensor in ('aqua', 'snpp') for a, b in schedule.get(sensor, [])]
        con.execute('CREATE TEMP TABLE excluded(start_date DATE,end_date DATE)')
        con.executemany('INSERT INTO excluded VALUES (?,?)', excluded)
        con.execute('''
            CREATE TEMP TABLE counts AS
            WITH overpasses AS (
                SELECT region,date,
                    max(day_lst_min) FILTER(WHERE sensor='aqua') AS a,
                    max(day_lst_min) FILTER(WHERE sensor='snpp') AS v
                FROM read_parquet(?) GROUP BY region,date
            ), paired AS (
                SELECT c.region,c.month,c.date,c.cell_y,c.cell_x,
                    bool_or(c.sensor='aqua') AS a, bool_or(c.sensor='snpp') AS v
                FROM read_parquet(?) c JOIN overpasses o USING(region,date)
                WHERE c.year BETWEEN ? AND ? AND abs(o.a-o.v) < ?
                    AND NOT EXISTS (SELECT 1 FROM excluded WHERE c.date BETWEEN start_date AND end_date)
                GROUP BY c.region,c.month,c.date,c.cell_y,c.cell_x
            ) SELECT region,month,count(*) FILTER(WHERE a) AS n1,
                count(*) FILTER(WHERE v) AS n2,count(*) FILTER(WHERE a AND v) AS m
              FROM paired GROUP BY region,month
        ''', [str(config.INTERIM_DIR / 'overpass.parquet'), str(config.INTERIM_DIR / 'cells.parquet'),
              *config.CALIBRATION_YEARS, config.SIMULTANEOUS_MAX_MINUTES])
        for region, month, n1, n2, m, support in con.execute('SELECT region,month,n1,n2,m,pooled_months FROM read_parquet(?)', [str(config.INTERIM_DIR / 'detection_probs.parquet')]).fetchall():
            actual = con.execute('SELECT sum(n1),sum(n2),sum(m) FROM counts WHERE region=? AND month IN (SELECT unnest(?))', [region,support]).fetchone()
            assert actual == (n1,n2,m)


def test_2026_sensors_processing_and_static_mask(tmp_path, monkeypatch):
    import cells
    import json

    monkeypatch.setattr(config, "RAW_DIR", tmp_path)
    monkeypatch.setattr(config, "RAW_2026_DIR", tmp_path / "2026")
    monkeypatch.setattr(config, "INTERIM_DIR", tmp_path / "interim")
    monkeypatch.setattr(cells, "assign_regions",
                        lambda con, table: con.execute(f"ALTER TABLE {table} ADD COLUMN region VARCHAR DEFAULT 'amazonia'"))
    (tmp_path / "2026").mkdir()
    annual = "satellite,latitude,longitude,acq_date,acq_time,frp,bright_ti4,scan,track,daynight,version,type,confidence\n"
    static = [f"N,-12.05,-77.05,2015-0{m}-0{d},1830,5,330,.4,.4,D,2,2,n" for m in (1, 2, 3) for d in (1, 2)]
    (tmp_path / "viirs-snpp_2015_Peru.csv").write_text(annual + "\n".join(static + [
        "N,-12.05,-77.05,2015-04-01,1830,5,330,.4,.4,D,2,0,n",
        "N,-5.05,-75.05,2015-04-01,1830,5,330,.4,.4,D,2,0,n"]) + "\n")
    (tmp_path / "modis_2015_Peru.csv").write_text(annual.replace("bright_ti4", "brightness") +
        "Aqua,-5.05,-75.05,2015-04-01,1830,5,330,1,1,D,61,0,80\n")
    header = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight"
    (tmp_path / "2026" / "viirs-snpp_2026_nrt.csv").write_text(header + "\n" +
        "-12.05,-77.05,331,.4,.4,2026-08-01,1830,SNPP,VIIRS,n,2.0NRT,290,5,D\n" +
        "-5.05,-75.05,332,.4,.4,2026-08-01,1830,SNPP,VIIRS,h,2.0NRT,290,5,D\n" +
        "-5.05,-75.05,333,.4,.4,2026-11-02,1830,SNPP,VIIRS,h,2.0NRT,290,5,D\n")
    (tmp_path / "2026" / "viirs-noaa20_2026_nrt.csv").write_text(header + "\n" +
        "-5.05,-75.05,334,.4,.4,2026-11-05,1800,N20,VIIRS,n,2.0NRT,290,5,D\n" +
        "-5.05,-75.05,334,.4,.4,2026-11-14,1800,N20,VIIRS,n,2.0NRT,290,5,D\n")
    (tmp_path / "2026" / "viirs-noaa21_2026_archive.csv").write_text(header + ",type\n" +
        "-5.05,-75.05,335,.4,.4,2026-03-01,1800,N21,VIIRS,n,2,290,5,D,0\n" +
        "-5.05,-75.05,335,.4,.4,2026-03-02,1800,N21,VIIRS,n,2,290,5,D,3\n")
    with duckdb.connect() as con:
        cells.build_cells(con)
        rows = con.execute("SELECT sensor, date::VARCHAR, processing, bright_max, cell_y FROM cells WHERE year = 2026 ORDER BY ALL").fetchall()
    assert rows == [("noaa20", "2026-11-05", "nrt", 334.0, -51), ("noaa21", "2026-03-01", "sp", 335.0, -51),
                    ("snpp", "2026-08-01", "nrt", 332.0, -51)]
    report = json.loads((config.INTERIM_DIR / "static_mask_validation.json").read_text())
    assert report["cells"] == {"viirs": 1}
    assert {r["sensor"]: (r["nrt_detections"], r["nrt_removed"]) for r in report["nrt_removed"]}["snpp"] == (3, 1)
