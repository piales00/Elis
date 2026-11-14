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
