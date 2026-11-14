import calendar
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import config
from build_series import connect


COLUMNS = ['lat', 'lon', 'region', 'year', 'month', 'raw_modis', 'raw_viirs', 'estimated', 'size_ratio']
REL_TOLERANCE = 0.005
ABS_TOLERANCE = 1.0


@pytest.fixture(scope='module')
def con():
    with connect() as connection:
        connection.execute('CREATE TEMP TABLE m AS SELECT * FROM read_parquet(?)',
                           [str(config.PROCESSED_DIR / 'map.parquet')])
        yield connection


@pytest.fixture(scope='module')
def series():
    rows = json.loads((config.PROCESSED_DIR / 'series.json').read_text())
    return [r for r in rows if r['region'] in config.REGIONS]


def test_columns_types_and_order(con):
    described = con.execute('DESCRIBE m').fetchall()
    assert [d[0] for d in described] == COLUMNS
    types = {d[0]: d[1] for d in described}
    assert types['lat'] == types['lon'] == types['estimated'] == 'DOUBLE'
    assert types['region'] == 'VARCHAR'
    for name in ('year', 'month', 'raw_modis', 'raw_viirs'):
        assert types[name] == 'INTEGER'
    assert con.execute('SELECT count(*) FROM m WHERE size_ratio IS NOT NULL').fetchone()[0] == 0
    ordered = con.execute('''SELECT count(*) FROM (SELECT year, month, region, lat, lon,
        lag(year) OVER w py, lag(month) OVER w pm, lag(region) OVER w pr, lag(lat) OVER w pa, lag(lon) OVER w po
        FROM (SELECT *, row_number() OVER () AS n FROM m) WINDOW w AS (ORDER BY n))
        WHERE py IS NOT NULL AND (year, month, region, lat, lon) < (py, pm, pr, pa, po)''').fetchone()[0]
    assert ordered == 0


def test_regions_and_unique_key(con):
    assert {r[0] for r in con.execute('SELECT DISTINCT region FROM m').fetchall()} == set(config.REGIONS)
    assert con.execute('SELECT count(*) FROM m').fetchone()[0] == \
        con.execute('SELECT count(*) FROM (SELECT DISTINCT lat, lon, year, month FROM m)').fetchone()[0]


def test_centers_on_grid(con):
    step = config.GRID_DEG
    bad = con.execute('''SELECT count(*) FROM m WHERE
        abs(((lat - ?/2) / ? - round((lat - ?/2) / ?))) > 1e-6
        OR abs(((lon - ?/2) / ? - round((lon - ?/2) / ?))) > 1e-6''', [step] * 8).fetchone()[0]
    assert bad == 0


def test_value_ranges(con):
    assert con.execute('SELECT count(*) FROM m WHERE estimated < 0 OR estimated IS NULL').fetchone()[0] == 0
    start = (config.VIIRS_START.year, config.VIIRS_START.month)
    for year, month, modis, viirs in con.execute('SELECT DISTINCT year, month, raw_modis, raw_viirs FROM m').fetchall():
        days = calendar.monthrange(year, month)[1]
        assert 0 <= modis <= days
        if (year, month) < start:
            assert viirs is None
        else:
            assert viirs is not None and 0 <= viirs <= days


def test_estimated_matches_series(con, series):
    sums = {(r[0], r[1], r[2]): r[3] for r in con.execute(
        'SELECT region, year, month, sum(estimated) FROM m GROUP BY 1,2,3').fetchall()}
    for row in series:
        got = sums.get((row['region'], row['year'], row['month']), 0.0)
        want = row['estimated']
        assert abs(got - want) <= max(ABS_TOLERANCE, REL_TOLERANCE * want), row


def test_raw_counts_match_series(con, series):
    sums = {(r[0], r[1], r[2]): r[3:] for r in con.execute(
        'SELECT region, year, month, sum(raw_modis), coalesce(sum(raw_viirs), 0) FROM m GROUP BY 1,2,3').fetchall()}
    for row in series:
        got = sums.get((row['region'], row['year'], row['month']), (0, 0))
        assert got[0] == row['raw_modis'], row
        assert got[1] == (row['raw_viirs'] or 0), row


def test_sample_matches_parquet(con):
    sample = json.loads((config.PROCESSED_DIR / 'map-sample-2024-09.json').read_text())
    assert sample
    assert all(list(r) == ['lat', 'lon', 'raw_modis', 'raw_viirs', 'estimated'] for r in sample)
    assert len(sample) == con.execute('SELECT count(*) FROM m WHERE year = 2024 AND month = 9').fetchone()[0]
