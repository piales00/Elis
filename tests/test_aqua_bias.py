from pathlib import Path
import sys

import numpy as np
import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import config
import aqua_bias


def synthetic(rng, bias, seasonal_shift=0.0, noise=0.05, years=None):
    start, end = years or (config.TEST_YEARS[0] - 8, config.TEST_YEARS[1])
    rows = []
    for region, base in bias.items():
        for year in range(start, end + 1):
            year_effect = rng.normal(0, noise)
            for month in range(1, 13):
                shift = seasonal_shift if aqua_bias.season_of(month) == 'high' else 0.0
                actual = 1000.0 if month in config.AQUA_BIAS_HIGH_SEASON else 100.0
                predicted = actual * np.exp(base + shift + year_effect + rng.normal(0, noise))
                rows.append(dict(region=region, year=year, month=month, predicted=predicted, actual=actual))
    return rows


def test_measure_uses_only_calibration_years():
    rng = np.random.default_rng(config.SEED)
    rows = synthetic(rng, {'amazonia': 0.0})
    for row in rows:
        if row['year'] >= config.TEST_YEARS[0]:
            row['predicted'] *= 10
    summary = aqua_bias.measure(rows, np.random.default_rng(config.SEED), replicates=200)
    assert summary['amazonia']['years'] == list(config.AQUA_BIAS_YEARS)
    assert {r['year'] for r in summary['amazonia']['annual']} == set(range(config.AQUA_BIAS_YEARS[0], config.AQUA_BIAS_YEARS[1] + 1))
    assert abs(summary['amazonia']['bias']) < 0.1


def test_significant_bias_is_detected_and_removed():
    rng = np.random.default_rng(config.SEED)
    rows = synthetic(rng, {'amazonia': 0.08, 'sierra': 0.0})
    summary = aqua_bias.measure(rows, np.random.default_rng(config.SEED), replicates=300)
    amazon, sierra = summary['amazonia'], summary['sierra']
    assert amazon['significant'] and amazon['bias_low'] > 0
    assert amazon['bias_low'] <= amazon['bias'] <= amazon['bias_high']
    assert not sierra['significant'] and sierra['bias_low'] <= 0 <= sierra['bias_high']
    factors = aqua_bias.correction_factors(summary)
    assert all(np.isclose(factors[('sierra', m)], 1.0) for m in range(1, 13))
    assert all(np.isclose(factors[('amazonia', m)], np.exp(-amazon['bias'])) for m in range(1, 13))
    start, end = config.AQUA_BIAS_YEARS
    calibration = [r for r in aqua_bias.corrected(rows, factors) if r['region'] == 'amazonia' and start <= r['year'] <= end]
    assert abs(aqua_bias.pooled_log_ratio(calibration)) < 1e-9


def test_correction_reduces_out_of_sample_error():
    rng = np.random.default_rng(config.SEED + 1)
    rows = synthetic(rng, {'amazonia': 0.08})
    summary = aqua_bias.measure(rows, np.random.default_rng(config.SEED), replicates=200)
    test = [r for r in rows if config.TEST_YEARS[0] <= r['year'] <= config.TEST_YEARS[1]]
    after = aqua_bias.corrected(test, aqua_bias.correction_factors(summary))
    assert abs(aqua_bias.pooled_log_ratio(after)) < abs(aqua_bias.pooled_log_ratio(test))


def test_seasonal_correction_only_when_difference_is_clear():
    rng = np.random.default_rng(config.SEED)
    rows = synthetic(rng, {'amazonia': 0.02}, seasonal_shift=0.15, noise=0.02)
    row = aqua_bias.measure(rows, np.random.default_rng(config.SEED), replicates=300)['amazonia']
    assert row['seasonal'] and row['significant']
    factors = aqua_bias.correction_factors({'amazonia': row})
    assert np.isclose(factors[('amazonia', config.AQUA_BIAS_HIGH_SEASON[0])], np.exp(-row['high_season']))
    low_month = next(m for m in range(1, 13) if m not in config.AQUA_BIAS_HIGH_SEASON)
    assert np.isclose(factors[('amazonia', low_month)], np.exp(-row['low_season']))
    flat = aqua_bias.measure(synthetic(np.random.default_rng(3), {'amazonia': 0.08}), np.random.default_rng(config.SEED), replicates=300)
    assert not flat['amazonia']['seasonal']


def test_disabled_correction_is_identity(monkeypatch):
    rng = np.random.default_rng(config.SEED)
    summary = aqua_bias.measure(synthetic(rng, {'amazonia': 0.1}), np.random.default_rng(config.SEED), replicates=100)
    monkeypatch.setattr(config, 'AQUA_BIAS_CORRECTION', False)
    assert all(v == 1.0 for v in aqua_bias.correction_factors(summary).values())


def test_pooled_log_ratio_rejects_empty_totals():
    with pytest.raises(ValueError):
        aqua_bias.pooled_log_ratio([dict(predicted=0.0, actual=1.0)])


def calibration_sensitivity(rng, bias):
    start, end = config.AQUA_BIAS_YEARS
    regions = []
    for region in config.REGIONS:
        monthly = [dict(year=y, month=m, actual=100.0, predicted=100.0 * np.exp(bias + rng.normal(0, 0.1)))
                   for y in range(start, end + 1) for m in range(1, 13)]
        regions.append(dict(region=region, start_year=start, end_year=end, monthly=monthly))
    return dict(calibration_diagnostics=regions)


def test_aqua_residuals_come_from_calibration_years_and_are_centered():
    from build_series import residual_factors
    sensitivity = calibration_sensitivity(np.random.default_rng(config.SEED), 0.12)
    factors, years = residual_factors(sensitivity, 'aqua')
    assert config.STRUCTURAL_ERROR_SOURCE['aqua'] == 'aqua_vs_viirs_calibration'
    assert years == list(range(config.AQUA_BIAS_YEARS[0], config.AQUA_BIAS_YEARS[1] + 1))
    assert not set(years) & set(range(config.TEST_YEARS[0], config.TEST_YEARS[1] + 1))
    for region in config.REGIONS:
        rows = next(r for r in sensitivity['calibration_diagnostics'] if r['region'] == region)['monthly']
        centered = sum(factors[(region, r['year'], r['month'])] * r['actual'] for r in rows)
        assert np.isclose(centered, sum(r['actual'] for r in rows))
