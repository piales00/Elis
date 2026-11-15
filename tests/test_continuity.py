import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

import config


@pytest.fixture(scope='module')
def continuity():
    return json.loads((config.PROCESSED_DIR / 'continuity.json').read_text())


@pytest.fixture(scope='module')
def series():
    return {(r['region'], f"{r['year']:04d}-{r['month']:02d}"): r
            for r in json.loads((config.PROCESSED_DIR / 'series.json').read_text()) if not r['is_forecast']}


def test_rows_cover_every_region_and_month(continuity):
    months = [f'{y:04d}-{m:02d}' for y in range(2012, 2027) for m in range(1, 13)
              if (y, m) <= (config.LAST_DATA_DATE.year, config.LAST_DATA_DATE.month)]
    assert continuity['period'] == [months[0], months[-1]]
    for region in continuity['regions']:
        assert [r['month'] for r in continuity['rows'] if r['region'] == region] == months


def test_harmonized_matches_series_and_does_not_need_modis(continuity, series):
    for row in continuity['rows']:
        source = series[(row['region'], row['month'])]
        assert (row['harmonized'], row['harmonized_low'], row['harmonized_high']) == (source['estimated'], source['est_low'], source['est_high'])
        assert row['harmonized_viirs_only'] + row['modis_filled'] == pytest.approx(row['harmonized'], abs=0.2)
        if row['modis_filled'] == 0:
            assert row['harmonized_viirs_only'] == pytest.approx(row['harmonized'], abs=0.1)
    check = continuity['metrics']['harmonized_check']
    assert check['viirs_identity_max_rel_diff'] < 1e-9
    assert check['max_abs_diff_rebuilt_vs_series'] < 0.2


def test_emulated_ranges_and_scenario(continuity):
    shutdown = continuity['scenario']['shutdown']
    for row in continuity['rows']:
        assert row['aqua_emulated_low'] <= row['aqua_emulated'] <= row['aqua_emulated_high']
        after = row['month'] >= shutdown
        assert row['modis_scale'] == (row['aqua_emulated'] if after else row['aqua_observed'])
    national = [r for r in continuity['rows'] if r['region'] == config.NATIONAL]
    for month in sorted({r['month'] for r in national}):
        parts = [r for r in continuity['rows'] if r['month'] == month and r['region'] in config.REGIONS]
        row = next(r for r in national if r['month'] == month)
        assert row['aqua_observed'] == sum(r['aqua_observed'] for r in parts)
        assert row['aqua_emulated'] == pytest.approx(sum(r['aqua_emulated'] for r in parts), abs=0.2)


def test_metrics_show_accuracy_before_drift_and_gap_after(continuity):
    summary = {(r['region'], r['period']): r for r in continuity['metrics']['summary']}
    pre = summary[(config.NATIONAL, 'pre_drift')]
    assert abs(pre['bias_pct']) < 5 and pre['annual_mape_pct'] < 10 and pre['range_coverage'] >= 0.85
    drift = summary[(config.NATIONAL, 'drift')]
    assert drift['aqua_vs_emulated_pct'] < pre['aqua_vs_emulated_pct'] and drift['range_coverage'] < pre['range_coverage']
    years = {(r['region'], r['year']): r for r in continuity['metrics']['emulator_by_year']}
    assert years[(config.NATIONAL, 2026)]['aqua_vs_emulated_pct'] < -20
