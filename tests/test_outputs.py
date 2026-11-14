import json
import math
from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import config
from build_series import connect, residual_factors


FIELDS = ('region', 'year', 'month', 'raw_modis', 'raw_viirs', 'raw_detections',
          'estimated', 'est_low', 'est_high', 'modis_equiv', 'source',
          'hist_median', 'anomaly_class', 'is_forecast')


@pytest.fixture(scope='module')
def outputs():
    return [json.loads((config.PROCESSED_DIR / name).read_text())
            for name in ('series.json', 'methodology.json')]


def number(value):
    return type(value) in (float, int) and math.isfinite(value)


def test_series_contract_and_coverage(outputs):
    series, _ = outputs
    assert series
    keys = set()
    for row in series:
        assert tuple(row) == FIELDS
        assert row['region'] in (*config.REGIONS, config.NATIONAL)
        assert type(row['year']) is int and config.FIRST_YEAR <= row['year'] <= config.LAST_YEAR
        assert type(row['month']) is int and 1 <= row['month'] <= 12
        key = tuple(row[k] for k in ('region', 'year', 'month'))
        assert key not in keys
        keys.add(key)
        assert row['source'] in ('modis_only', 'both', 'viirs_only')
        assert row['anomaly_class'] in ('low', 'normal', 'high', 'very_high')
        assert row['is_forecast'] is False
        for name in ('raw_modis', 'raw_detections'):
            assert type(row[name]) is int and row[name] >= 0
        if (row['year'], row['month']) < (config.VIIRS_START.year, config.VIIRS_START.month):
            assert row['raw_viirs'] is None
        else:
            assert type(row['raw_viirs']) is int and row['raw_viirs'] >= 0
        for name in ('estimated', 'est_low', 'est_high', 'modis_equiv', 'hist_median'):
            assert number(row[name]) and row[name] >= 0
        assert row['est_low'] <= row['estimated'] <= row['est_high']
    with connect() as con:
        first, last = con.execute('SELECT min(date),max(date) FROM read_parquet(?)', [str(config.INTERIM_DIR/'cells.parquet')]).fetchone()
    indices = range(first.year*12+first.month, last.year*12+last.month+1)
    expected = {(r, (i-1)//12, (i-1)%12+1) for r in (*config.REGIONS, config.NATIONAL) for i in indices}
    assert keys == expected


def test_national_raw_totals_and_estimate_origin(outputs):
    series, _ = outputs
    index = {(r['region'], r['year'], r['month']):r for r in series}
    for row in series:
        if row['region'] != config.NATIONAL:
            continue
        regional = [index[(r,row['year'],row['month'])] for r in config.REGIONS]
        for field in ('raw_modis', 'raw_viirs', 'raw_detections'):
            if row[field] is None:
                assert all(r[field] is None for r in regional)
            else:
                assert row[field] == sum(r[field] for r in regional)
    with connect() as con:
        for r,y,m,e,s in con.execute('SELECT region,year,month,estimated,source FROM read_parquet(?)', [str(config.INTERIM_DIR/'estimates.parquet')]).fetchall():
            assert index[(r,y,m)]['estimated'] == round(e, 1)
            assert index[(r,y,m)]['source'] == s


def test_methodology_contract(outputs):
    _, method = outputs
    assert set(method) == {'params','detection','validation','emulator','periods','findings'}
    assert method['params'] == dict(grid_deg=config.GRID_DEG,calibration_years=list(config.CALIBRATION_YEARS),
        test_years=list(config.TEST_YEARS),simultaneous_max_minutes=config.SIMULTANEOUS_MAX_MINUTES,ci_level=config.CI_LEVEL)
    assert len(method['detection']) == (len(config.REGIONS)+1)*12
    assert {(r['region'],r['month']) for r in method['detection']} == {(r,m) for r in (*config.REGIONS,config.NATIONAL) for m in range(1,13)}
    for row in method['detection']:
        assert set(row) == {'region','month','n_modis','n_viirs','n_both','p_modis','p_viirs'}
        for name in ('n_modis','n_viirs','n_both'):
            assert type(row[name]) is int and row[name]>=0
        assert row['n_both'] <= min(row['n_modis'],row['n_viirs'])
        for name in ('p_modis','p_viirs'):
            assert number(row[name]) and 0 <= row[name] <= 1
    assert {r['region'] for r in method['validation']} == {*config.REGIONS,config.NATIONAL}
    assert len(method['validation']) == len(config.REGIONS)+1
    for row in method['validation']:
        assert set(row) == {'region','error_pct_method','error_pct_naive','mapbiomas_corr'}
        assert all(number(row[k]) and row[k]>=0 for k in ('error_pct_method','error_pct_naive'))
        assert row['mapbiomas_corr'] is None or (number(row['mapbiomas_corr']) and -1<=row['mapbiomas_corr']<=1)
    emulator = method['emulator']
    assert set(emulator) == {'train_years','test_years','auc','brier','monthly_error_pct','monthly_error_pct_fixed_ratio','by_region'}
    original = json.loads((config.INTERIM_DIR/'emulator_metrics.json').read_text())
    assert emulator == {k:original[k] for k in emulator}
    assert emulator['train_years'] == list(config.CALIBRATION_YEARS)
    assert emulator['test_years'] == list(config.TEST_YEARS)
    for key in ('auc','brier'):
        assert number(emulator[key]) and 0<=emulator[key]<=1
    for key in ('monthly_error_pct','monthly_error_pct_fixed_ratio'):
        assert number(emulator[key]) and emulator[key]>=0
    for row in emulator['by_region']:
        assert set(row) == {'region','monthly_error_pct','annual_error_pct'}
        assert row['region'] in config.REGIONS
        assert all(number(row[k]) and row[k]>=0 for k in ('monthly_error_pct','annual_error_pct'))
    for row in method['periods']:
        assert {'from','to','source','confidence'} <= set(row) <= {'from','to','source','confidence','note','partial_through'}
        assert row['source'] in ('terra_bridge','aqua','viirs')
        assert row['confidence'] in ('low','normal','provisional')
        assert row['from'] <= row['to']
    assert set(method['findings']) == {'calibration_overpass_gaps','chapman_correlated_bias_pct','emulator_drift','aqua_overpass_by_year','definitions',
                                       'emulator_drift_latest','static_source_mask','noaa20_ratio'}
    assert method['findings']['emulator_drift']['year'] == config.HISTORY_YEARS[1]
    assert method['findings']['chapman_correlated_bias_pct'] < 0


def test_replicates_preserve_reference_and_sum_before_quantiles(outputs):
    series, _ = outputs
    with connect() as con:
        con.execute('CREATE TABLE final AS SELECT * FROM read_parquet(?)', [str(config.INTERIM_DIR/'series_replicates.parquet')])
        assert con.execute('SELECT count(*) FROM final').fetchone()[0] == len(series)*config.BOOTSTRAP_N
        assert con.execute('SELECT count(*)=count(DISTINCT (region,year,month,replicate)) FROM final').fetchone()[0]
        assert con.execute('SELECT min(replicate),max(replicate) FROM final').fetchone() == (0,config.BOOTSTRAP_N-1)
        delta = con.execute('''SELECT max(abs(national-regional)) FROM (
            SELECT year,month,replicate,max(estimated) FILTER(WHERE region=?) AS national,
                sum(estimated) FILTER(WHERE region<>?) AS regional FROM final GROUP BY year,month,replicate)
        ''', [config.NATIONAL,config.NATIONAL]).fetchone()[0]
        assert delta < 1e-8
        delta = con.execute('''SELECT max(abs(f.estimated-b.estimated)) FROM final f
            JOIN read_parquet(?) b USING(region,year,month,replicate) WHERE year>=?''',
            [str(config.INTERIM_DIR/'estimate_replicates.parquet'),config.VIIRS_START.year]).fetchone()[0]
        assert delta < 1e-8
        limits = {(r,y,m):(lo,hi) for r,y,m,lo,hi in con.execute('''SELECT region,year,month,
            quantile_cont(estimated,?),quantile_cont(estimated,?) FROM final GROUP BY region,year,month''',
            [(1-config.CI_LEVEL)/2,(1+config.CI_LEVEL)/2]).fetchall()}
        for row in series:
            lo,hi = limits[(row['region'],row['year'],row['month'])]
            assert row['est_low'] == min(round(lo,1),row['estimated'])
            assert row['est_high'] == max(round(hi,1),row['estimated'])


def test_structural_residual_zero_limit_and_complete_blocks():
    sensitivity = json.loads((config.INTERIM_DIR/'sensitivity.json').read_text())
    factors,years = residual_factors(sensitivity,'terra')
    assert len(factors) == len(config.REGIONS)*12*len(years)
    assert all(math.isfinite(x) and x>=0 for x in factors.values())
    for row in sensitivity['terra_backcast']:
        for sample in row['monthly']:
            if sample['predicted']==0:
                assert factors[(row['region'],sample['year'],sample['month'])]==0


def test_historical_baselines_and_anomalies(outputs):
    series,_ = outputs
    last = (config.LAST_DATA_DATE.year, config.LAST_DATA_DATE.month)
    with connect() as con:
        window = con.execute('SELECT region,year,estimated FROM read_parquet(?) WHERE year BETWEEN ? AND ?',
            [str(config.INTERIM_DIR/'partial_window_estimates.parquet'),*config.HISTORY_YEARS]).fetchall()
    for row in series:
        if (row['year'],row['month']) == last:
            history = [e for r,y,e in window if r==row['region']]
            assert len(history) == config.HISTORY_YEARS[1]-config.HISTORY_YEARS[0]+1
        else:
            history = [r['estimated'] for r in series if r['region']==row['region'] and r['month']==row['month']
                       and config.HISTORY_YEARS[0]<=r['year']<=config.HISTORY_YEARS[1]]
        assert row['hist_median'] == pytest.approx(float(np.median(history)),abs=0.1)
        thresholds = np.percentile(history, config.ANOMALY_PERCENTILES)
        value = row['estimated']
        expected = ('low' if value < thresholds[0] - 0.05 else 'normal' if value <= thresholds[1] - 0.05 else
                    'high' if value <= thresholds[2] - 0.05 else 'very_high')
        if min(abs(value - t) for t in thresholds) > 0.05:
            assert row['anomaly_class'] == expected, row


def test_structural_year_blocks_preserve_spatial_and_seasonal_dependence():
    sensitivity = json.loads((config.INTERIM_DIR/'sensitivity.json').read_text())
    with connect() as con:
        for sensor, year in [('terra',config.FIRST_YEAR+1),('aqua',config.HISTORY_YEARS[0])]:
            factors, years = residual_factors(sensitivity,sensor)
            rows = con.execute('''SELECT f.region,f.month,f.replicate,f.estimated/b.estimated AS factor
                FROM read_parquet(?) f JOIN read_parquet(?) b USING(region,year,month,replicate)
                WHERE f.region<>? AND year=? AND b.estimated>0 ORDER BY replicate,region,month''',
                [str(config.INTERIM_DIR/'series_replicates.parquet'),str(config.INTERIM_DIR/'estimate_replicates.parquet'),
                 config.NATIONAL,year]).fetchall()
            for replicate in range(config.BOOTSTRAP_N):
                block = [(r,m,value) for r,m,i,value in rows if i==replicate]
                assert block
                assert any(all(np.isclose(value,factors[(r,y,m)]) for r,m,value in block) for y in years)


def test_raw_cell_union_and_modis_equivalent(outputs):
    series,_ = outputs
    index = {(r['region'],r['year'],r['month']):r for r in series}
    with connect() as con:
        rows = con.execute('''SELECT region,year,month,
            count(DISTINCT (cell_y,cell_x,date)) FILTER(WHERE sensor IN ('aqua','terra')),
            count(*) FILTER(WHERE sensor='snpp'),count(*) FILTER(WHERE sensor='aqua'),
            count(*) FILTER(WHERE sensor='terra') FROM read_parquet(?) GROUP BY region,year,month''',
            [str(config.INTERIM_DIR/'cells.parquet')]).fetchall()
        ratios = {(r,m):v for r,m,v in con.execute('SELECT region,month,ratio FROM read_parquet(?)',
            [str(config.INTERIM_DIR/'terra_bridge.parquet')]).fetchall()}
        for r,y,m,modis,viirs,aqua,terra in rows:
            row = index[(r,y,m)]
            assert row['raw_modis']==modis
            if (y,m)>=(config.VIIRS_START.year,config.VIIRS_START.month):
                assert row['raw_viirs']==viirs
            equivalent = terra*ratios[(r,m)] if (y,m)<(config.AQUA_START.year,config.AQUA_START.month) else aqua
            assert row['modis_equiv']==round(equivalent,1)


def test_series_2026_uses_snpp_only_and_marks_partial_month(outputs):
    series, method = outputs
    last = (config.LAST_DATA_DATE.year, config.LAST_DATA_DATE.month)
    with connect() as con:
        cells = str(config.INTERIM_DIR/'cells.parquet')
        assert con.execute('SELECT max(date) FROM read_parquet(?)', [cells]).fetchone()[0] == config.LAST_DATA_DATE
        assert con.execute("SELECT max(date) FROM read_parquet(?) WHERE sensor='snpp'", [cells]).fetchone()[0] <= config.SNPP_END
        counts = {(r,y,m): (s,n) for r,y,m,s,n in con.execute('''SELECT region,year,month,
            count(*) FILTER(WHERE sensor='snpp'), count(*) FILTER(WHERE sensor IN ('noaa20','noaa21'))
            FROM read_parquet(?) WHERE year=? GROUP BY ALL''', [cells, config.LAST_DATA_DATE.year]).fetchall()}
        estimates = {(r,y,m): (p,b) for r,y,m,p,b in con.execute(
            'SELECT region,year,month,partial_through,noaa20_bridge FROM read_parquet(?)',
            [str(config.INTERIM_DIR/'estimates.parquet')]).fetchall()}
        segments = con.execute('''SELECT s.region,s.estimated,s.n_noaa20,n.ratio,p.p2 FROM read_parquet(?) s
            JOIN read_parquet(?) n USING(region) JOIN read_parquet(?) p USING(region,month) WHERE s.mode='noaa20' ''',
            [str(config.INTERIM_DIR/f) for f in ('capture_segments.parquet','noaa20_ratio.parquet','detection_probs.parquet')]).fetchall()
    sensitivity = json.loads((config.INTERIM_DIR/'sensitivity.json').read_text())
    rows = [r for r in series if r['year'] == config.LAST_DATA_DATE.year and r['region'] in config.REGIONS]
    assert rows
    for row in rows:
        snpp, others = counts[(row['region'],row['year'],row['month'])]
        assert row['raw_viirs'] == snpp and others > 0
        assert row['source'] == 'viirs_only'
    last_rows = [r for r in series if (r['year'],r['month']) == last]
    if sensitivity['noaa20_included']:
        assert {r['region'] for r in last_rows} == {*config.REGIONS, config.NATIONAL}
        assert all(estimates[(r['region'],*last)] == (config.LAST_DATA_DATE, True) for r in last_rows)
        assert segments and all(abs(e - n*ratio/p2) < 1e-8 for _,e,n,ratio,p2 in segments)
        assert all(r['cv'] <= config.N20_RATIO_MAX_CV for r in sensitivity['noaa20_ratio'])
        final = method['periods'][-1]
        assert (final['to'], final['partial_through'], final['confidence']) == (
            f'{last[0]:04d}-{last[1]:02d}', config.LAST_DATA_DATE.isoformat(), 'provisional')
    else:
        assert not last_rows and not segments
    assert all(not b for (r,y,m),(p,b) in estimates.items() if (y,m) != last)
    assert all(p is None for (r,y,m),(p,b) in estimates.items() if (y,m) != last)


def test_history_and_calibration_exclude_2026():
    sensitivity = json.loads((config.INTERIM_DIR/'sensitivity.json').read_text())
    assert config.HISTORY_YEARS[1] < config.SNPP_END.year
    assert config.CALIBRATION_YEARS[1] < config.SNPP_END.year and config.TEST_YEARS[1] < config.SNPP_END.year
    years = {r['year'] for r in sensitivity['partial_window']}
    assert config.SNPP_END.year in years and min(years) == config.FIRST_YEAR
    ytd = {r['year']: r for r in sensitivity['year_to_date']}
    assert set(ytd) == set(range(config.VIIRS_START.year, config.SNPP_END.year + 1))
