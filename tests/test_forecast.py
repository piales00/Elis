import json
import math
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import config
import forecast
from build_series import SERIES_FIELDS, connect


UNITS = (*config.REGIONS, config.NATIONAL)


@pytest.fixture(scope='module')
def outputs():
    series = json.loads((config.PROCESSED_DIR / 'series.json').read_text())
    method = json.loads((config.PROCESSED_DIR / 'methodology.json').read_text())
    return series, method


def number(value):
    return type(value) in (float, int) and math.isfinite(value)


def test_observed_rows_untouched_and_first(outputs):
    series, _ = outputs
    flags = [r['is_forecast'] for r in series]
    assert flags == sorted(flags)
    observed = [r for r in series if not r['is_forecast']]
    assert all(r['source'] != 'forecast' for r in observed)
    with connect() as con:
        estimates = {(r, y, m): (round(e, 1), s) for r, y, m, e, s in con.execute(
            'SELECT region,year,month,estimated,source FROM read_parquet(?)',
            [str(config.INTERIM_DIR / 'estimates.parquet')]).fetchall()}
    assert {(r['region'], r['year'], r['month']): (r['estimated'], r['source']) for r in observed} == estimates
    assert forecast.split_series(series) == observed


def test_forecast_rows_schema(outputs):
    series, method = outputs
    observed = [r for r in series if not r['is_forecast']]
    rows = [r for r in series if r['is_forecast']]
    assert rows
    last = max(forecast.to_index(r['year'], r['month']) for r in observed)
    keys = {(r['region'], r['year'], r['month']) for r in observed}
    for row in rows:
        assert tuple(row) == SERIES_FIELDS
        assert row['region'] in UNITS
        assert row['source'] == 'forecast'
        assert all(row[k] is None for k in ('raw_modis', 'raw_viirs', 'raw_detections', 'modis_equiv'))
        assert type(row['year']) is int and row['year'] <= config.LAST_YEAR
        assert forecast.to_index(row['year'], row['month']) > last
        assert (row['region'], row['year'], row['month']) not in keys
        for name in ('estimated', 'est_low', 'est_high', 'hist_median'):
            assert number(row[name]) and row[name] >= 0
        assert row['est_low'] <= row['estimated'] <= row['est_high']
        assert row['est_low'] < row['est_high']
        history = [r['estimated'] for r in observed if r['region'] == row['region'] and r['month'] == row['month']
                   and config.HISTORY_YEARS[0] <= r['year'] <= config.HISTORY_YEARS[1]]
        assert row['hist_median'] == pytest.approx(float(np.median(history)), abs=0.1)
        assert row['anomaly_class'] == forecast.classify(row['estimated'], history)
    assert len({(r['region'], r['year'], r['month']) for r in rows}) == len(rows)
    published = {(p['region'], p['month']) for p in method['forecast']['published']}
    assert published == {(r['region'], f"{r['year']:04d}-{r['month']:02d}") for r in rows}


def test_partial_month_is_not_origin_or_forecast(outputs):
    series, method = outputs
    partial = forecast.partial_month(method)
    info = method['forecast']
    assert info['excluded_partial_month'] == partial
    if partial:
        assert info['origin'] < partial
        assert all(f"{r['year']:04d}-{r['month']:02d}" != partial for r in series if r['is_forecast'])
        fire = forecast.fire_values([r for r in series if not r['is_forecast']], 'estimated', partial)
        year, month = map(int, partial.split('-'))
        assert all(forecast.to_index(year, month) not in values for values in fire.values())
    for entry in info['published']:
        assert entry['origin'] == info['origin']
        assert entry['lead'] in config.FORECAST_LEADS


def test_methodology_forecast_block(outputs):
    _, method = outputs
    info = method['forecast']
    assert info['backtest']['years'] == list(config.HISTORY_YEARS)
    assert config.HISTORY_YEARS[1] < config.FORECAST_OOS_YEAR
    assert info['out_of_sample']['year'] == config.FORECAST_OOS_YEAR
    assert info['variant'] in forecast.VARIANTS
    assert info['predictors'] == list(forecast.VARIANTS[info['variant']])
    rows = info['backtest']['by_region']
    assert {(r['region'], r['target'], r['lead']) for r in rows} == (
        {(u, 'month', l) for u in UNITS for l in config.FORECAST_LEADS} | {(u, 'season', 1) for u in UNITS})
    for row in rows:
        for name in forecast.METHODS:
            assert number(row[f'mae_log_{name}']) and row[f'mae_log_{name}'] >= 0
            assert 0 <= row[f'class_hit_{name}'] <= 1
        assert 0 <= row['coverage_model'] <= 1
    skill = {(r['region'], r['lead']): r for r in rows if r['target'] == 'month'}
    for entry in info['published']:
        s = skill[(entry['region'], entry['lead'])]
        assert entry['method'] == ('model' if s['mae_log_model'] < s['mae_log_climatology'] else 'climatology')
    for row in info['out_of_sample']['by_region']:
        assert row['predicted_low'] <= row['predicted'] <= row['predicted_high']
    demo = info['raw_vs_corrected']
    assert {r['series'] for r in demo['cross_2012']} == {r['series'] for r in demo['trend']} == {'raw_detections', 'estimated'}


def test_out_of_sample_year_does_not_affect_backtest(outputs):
    series, method = outputs
    observed = [r for r in series if not r['is_forecast']]
    partial = forecast.partial_month(method)
    climate = forecast.climate_values(pd.read_parquet(forecast.CLIMATE_PATH))
    fire = forecast.fire_values(observed, 'estimated', partial)
    changed = {u: {i: v * (10 if forecast.to_month(i)[0] == config.FORECAST_OOS_YEAR else 1) for i, v in values.items()}
               for u, values in fire.items()}
    unit = config.REGIONS[0]
    predictors = forecast.VARIANTS[method['forecast']['variant']]
    for lead in (1, forecast.SEASON):
        a = forecast.backtest(forecast.unit_frames(fire, climate, unit, config.FORECAST_OOS_YEAR)[lead], predictors)
        b = forecast.backtest(forecast.unit_frames(changed, climate, unit, config.FORECAST_OOS_YEAR)[lead], predictors)
        assert a['year'].max() <= config.HISTORY_YEARS[1]
        pd.testing.assert_frame_equal(a, b)


def test_classify_matches_series_rule():
    reference = list(range(1, 101))
    thresholds = np.percentile(reference, config.ANOMALY_PERCENTILES)
    assert forecast.classify(thresholds[0] - 1, reference) == 'low'
    assert forecast.classify(thresholds[1], reference) == 'normal'
    assert forecast.classify(thresholds[2], reference) == 'high'
    assert forecast.classify(thresholds[2] + 1, reference) == 'very_high'


import forecast_v2


@pytest.fixture(scope='module')
def outlook():
    return json.loads((config.PROCESSED_DIR / 'forecast.json').read_text())


def test_outlook_regions_schema(outlook):
    regions = {r['region']: r for r in outlook['regions']}
    features = json.loads((config.PROCESSED_DIR / 'regions.geojson').read_text())['features']
    assert set(regions) == {f['properties']['id'] for f in features}
    assert outlook['classes'] == list(forecast_v2.CLASSES)
    assert outlook['class_percentiles'] == list(config.ANOMALY_PERCENTILES)
    assert outlook['origin'] < outlook['excluded_partial_month']
    for entry in regions.values():
        if entry['level'] == 'department':
            active = entry['season_median_2003_2025'] >= config.FORECAST_DEPARTMENT_MIN_SEASON
            assert entry['active'] == active
        else:
            assert entry['active']
        if not entry['active']:
            assert entry['published'] is False and entry['method'] is None and 'median' not in entry
            continue
        assert entry['published'] and entry['method'] in ('model', 'climatology')
        assert entry['target_year'] == outlook['target_year'] and entry['lead'] == outlook['lead']
        assert 0 <= entry['low'] <= entry['median'] <= entry['high']
        assert sum(entry['probabilities'].values()) == pytest.approx(1, abs=0.005)
        assert list(entry['probabilities']) == outlook['classes']
        assert [s['lead'] for s in entry['skill_by_lead']] == list(config.FORECAST_SEASON_LEADS)


def test_outlook_method_follows_backtest_skill(outlook):
    rows = {(r['region'], r['variant'], r['lead']): r for r in outlook['backtest']['rows']}
    for entry in outlook['regions']:
        if not entry['published']:
            continue
        skill = rows[(entry['region'], outlook['variant'], outlook['lead'])]
        assert entry['method'] == ('model' if forecast_v2.has_skill(skill) else 'climatology')
        if entry['method'] == 'climatology':
            assert entry['median'] == entry['hist_median']
            assert entry['probabilities'] == outlook['climatology_probabilities']
            assert 'predictors' not in entry
    metrics = outlook['metrics']
    departments = [r for r in outlook['regions'] if r['level'] == 'department']
    assert metrics['departments_published'] == sum(r['published'] for r in departments)
    assert len(metrics['departments_model']) + len(metrics['departments_climatology']) == metrics['departments_published']


def test_outlook_backtest_rows(outlook):
    rows = outlook['backtest']['rows']
    assert outlook['backtest']['years'] == list(config.HISTORY_YEARS)
    variants = {*config.FORECAST_VARIANT_GROUPS, forecast_v2.SELECTED_IN_CV}
    for unit in (config.NATIONAL, *config.REGIONS):
        assert {(r['variant'], r['lead']) for r in rows if r['region'] == unit} == {
            (v, l) for v in variants for l in config.FORECAST_SEASON_LEADS}
    for row in rows:
        assert row['n'] == config.HISTORY_YEARS[1] - config.HISTORY_YEARS[0] + 1
        assert 0 <= row['coverage_model'] <= 1 and row['rps_model'] >= 0
        assert row['rpss'] == pytest.approx(1 - row['rps_model'] / row['rps_climatology'], abs=1e-3)
        assert sum(row['chosen'].values()) == row['n']


def test_department_sums_match_macroregions(outlook, outputs):
    series, method = outputs
    observed = forecast.split_series(series)
    partial = forecast.partial_month(method)
    fire = forecast_v2.series_fire(observed, partial)
    frame = pd.read_parquet(forecast_v2.MAP_PATH)
    cells = forecast_v2.cell_departments(frame)
    assert set(cells['department']) <= {f['properties']['id'] for f in forecast_v2.department_features()}
    departments = forecast_v2.department_fire(frame, cells, set(fire[config.NATIONAL]), partial)
    macro_of = {f['properties']['id']: f['properties']['macroregion'] for f in forecast_v2.department_features()}
    check = forecast_v2.check_sums({r: fire[r] for r in config.REGIONS}, departments, macro_of)
    assert check['max_rel_diff'] < 1e-4
    assert outlook['departments_check']['max_rel_diff'] == check['max_rel_diff']


def synthetic_frame(seed=0):
    rng = np.random.default_rng(seed)
    years = np.arange(config.HISTORY_YEARS[0], config.FORECAST_OOS_YEAR + 1)
    fire = rng.normal(size=len(years))
    frame = pd.DataFrame(dict(year=years, origin_year=years, origin=[f'{y}-07' for y in years], fire=fire,
                              oni=rng.normal(size=len(years)), icen=rng.normal(size=len(years)),
                              **{f'spi{s}': rng.normal(size=len(years)) for s in config.FORECAST_DROUGHT_WINDOWS}))
    frame['value'] = np.exp(7 + 0.5 * fire + rng.normal(scale=0.3, size=len(years)))
    return frame


def test_test_year_is_not_used_for_selection_or_fit():
    candidates = forecast_v2.variant_candidates()[forecast_v2.SELECTED_IN_CV]
    frame = synthetic_frame()
    year = 2010
    changed = frame.copy()
    changed.loc[changed['year'] == year, 'value'] *= 50
    changed.loc[changed['year'] == config.FORECAST_OOS_YEAR, 'value'] *= 50
    a = forecast_v2.evaluate(frame, candidates, {})
    b = forecast_v2.evaluate(changed, candidates, {})
    row_a, row_b = a[a['year'] == year].iloc[0], b[b['year'] == year].iloc[0]
    assert row_a['model'] == pytest.approx(row_b['model']) and row_a['chosen'] == row_b['chosen']
    assert a['year'].max() == config.HISTORY_YEARS[1]


def test_loo_residuals_match_explicit_refits():
    frame = synthetic_frame(1)
    frame['origin_year'] = frame['year'] - 1
    columns = ('fire', 'oni')
    residuals, alpha = forecast_v2.loo_residuals(frame, columns)
    x, y = frame[list(columns)].to_numpy(), forecast_v2.log_value(frame['value'])
    for i, year in enumerate(frame['year']):
        keep = forecast_v2.usable(frame, year).to_numpy()
        expected = y[i] - forecast_v2.ridge(x[keep], y[keep], alpha)(x[i:i + 1])[0]
        assert residuals[i] == pytest.approx(expected)


def test_rps_and_climatology_probabilities():
    assert sum(forecast_v2.CLIMATOLOGY_PROBS) == pytest.approx(1)
    assert forecast_v2.rps(np.array([0, 1, 0, 0.0]), 'normal') == 0
    assert forecast_v2.rps(np.array([1, 0, 0, 0.0]), 'very_high') == pytest.approx(3)
    probs = forecast_v2.class_probabilities(np.log(1000 + config.FORECAST_LOG_OFFSET), 0.3, np.arange(500, 1500))
    assert probs.sum() == pytest.approx(1) and np.argmax(probs) == 1


def test_season_outlook_in_methodology(outlook, outputs):
    _, method = outputs
    info = method['forecast']['season_outlook']
    assert info['file'] == 'forecast.json'
    assert (info['variant'], info['origin'], info['target_year'], info['lead']) == (
        outlook['variant'], outlook['origin'], outlook['target_year'], outlook['lead'])
    expected = {r['region']: r['method'] for r in outlook['regions'] if r['level'] != 'department'}
    assert {r['region']: r['method'] for r in info['published']} == expected
