import calendar
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import config
from build_series import connect


COLUMNS = ['lat', 'lon', 'region', 'year', 'month', 'raw_terra', 'raw_aqua', 'raw_modis', 'raw_viirs',
           'estimated', 'size_ratio']
SAMPLE_FIELDS = ['lat', 'lon', 'raw_terra', 'raw_aqua', 'raw_modis', 'raw_viirs', 'estimated']
MAX_CELL_DAYS = 31
MAX_ABOVE_PCT = 0.1
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
    for name in ('year', 'month', 'raw_terra', 'raw_aqua', 'raw_modis', 'raw_viirs'):
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
    rows = con.execute('SELECT DISTINCT year, month, raw_terra, raw_aqua, raw_modis, raw_viirs FROM m').fetchall()
    for year, month, terra, aqua, modis, viirs in rows:
        days = calendar.monthrange(year, month)[1]
        assert 0 <= terra <= days and 0 <= aqua <= days
        assert max(terra, aqua) <= modis <= min(days, terra + aqua)
        if (year, month) < (config.AQUA_START.year, config.AQUA_START.month):
            assert aqua == 0
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


def test_terra_aqua_match_cells(con):
    con.execute('CREATE TEMP TABLE IF NOT EXISTS c AS SELECT * FROM read_parquet(?)',
                [str(config.INTERIM_DIR / 'cells.parquet')])
    want = dict(((r, y, m, s), n) for r, y, m, s, n in con.execute(
        "SELECT region, year, month, sensor, count(*) FROM c WHERE sensor IN ('terra','aqua') GROUP BY ALL").fetchall())
    got = con.execute('SELECT region, year, month, sum(raw_terra), sum(raw_aqua) FROM m GROUP BY ALL').fetchall()
    assert got
    for r, y, m, terra, aqua in got:
        assert terra == want.get((r, y, m, 'terra'), 0)
        assert aqua == want.get((r, y, m, 'aqua'), 0)


def test_raw_aqua_matches_modis_equiv(con, series):
    aqua_end = con.execute("SELECT max(date) FROM read_parquet(?) WHERE sensor = 'aqua'",
                           [str(config.INTERIM_DIR / 'cells.parquet')]).fetchone()[0]
    sums = {(r, y, m): a for r, y, m, a in con.execute('SELECT region, year, month, sum(raw_aqua) FROM m GROUP BY ALL').fetchall()}
    checked = 0
    for row in series:
        period = (row['year'], row['month'])
        if (config.AQUA_START.year, config.AQUA_START.month) <= period <= (aqua_end.year, aqua_end.month):
            assert sums.get((row['region'], *period), 0) == row['modis_equiv'], row
            checked += 1
    assert checked


def test_every_row_has_activity_or_estimate(con):
    assert con.execute('''SELECT count(*) FROM m WHERE raw_modis = 0 AND coalesce(raw_viirs, 0) = 0
        AND estimated <= 0''').fetchone()[0] == 0


def test_unseen_cells_follow_validation_decision(con, series):
    validation = json.loads((config.INTERIM_DIR / 'map_validation.json').read_text())
    by_region = validation['by_region']
    better = all(by_region[r]['spearman_new']['median'] > by_region[r]['spearman_current']['median']
                 for r in config.REGIONS)
    assert validation['applied'] == better
    modis_only = {(r['region'], r['year'], r['month']) for r in series if r['source'] == 'modis_only'}
    unseen = con.execute('''SELECT region, year, month, count(*) FROM m
        WHERE raw_modis = 0 AND coalesce(raw_viirs, 0) = 0 GROUP BY ALL''').fetchall()
    if validation['applied']:
        assert unseen
        assert all((r, y, m) in modis_only for r, y, m, _ in unseen)
        nulls = con.execute('''SELECT count(*) FROM m WHERE raw_modis = 0 AND coalesce(raw_viirs, 0) = 0
            AND (raw_terra <> 0 OR raw_aqua <> 0)''').fetchone()[0]
        assert nulls == 0
    else:
        assert not unseen


def test_cells_above_month_length(con):
    total, above = con.execute('SELECT count(*), count(*) FILTER (WHERE estimated > ?) FROM m', [MAX_CELL_DAYS]).fetchone()
    assert 100 * above / total < MAX_ABOVE_PCT


def test_sample_matches_parquet(con):
    sample = json.loads((config.PROCESSED_DIR / 'map-sample-2024-09.json').read_text())
    assert sample
    assert all(list(r) == SAMPLE_FIELDS for r in sample)
    result = con.execute(f"SELECT {', '.join(SAMPLE_FIELDS)} FROM m WHERE year = 2024 AND month = 9 ORDER BY lat, lon")
    assert sample == [dict(zip(SAMPLE_FIELDS, row)) for row in result.fetchall()]
