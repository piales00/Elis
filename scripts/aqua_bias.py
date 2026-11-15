import numpy as np

import config


def pooled_log_ratio(rows):
    predicted = sum(r['predicted'] for r in rows)
    actual = sum(r['actual'] for r in rows)
    if predicted <= 0 or actual <= 0:
        raise ValueError('Pooled log ratio requires positive predicted and actual totals.')
    return float(np.log(predicted / actual))


def season_of(month):
    return 'high' if month in config.AQUA_BIAS_HIGH_SEASON else 'low'


def statistics(rows):
    seasons = {s: [r for r in rows if season_of(r['month']) == s] for s in ('high', 'low')}
    high, low = (pooled_log_ratio(seasons[s]) for s in ('high', 'low'))
    return pooled_log_ratio(rows), high, low, high - low


def year_bootstrap(rows, rng, replicates):
    years = sorted({r['year'] for r in rows})
    by_year = {y: [r for r in rows if r['year'] == y] for y in years}
    draws = np.empty((replicates, 4))
    for i in range(replicates):
        sample = rng.choice(years, size=len(years))
        draws[i] = statistics([r for y in sample for r in by_year[y]])
    return draws


def interval(values):
    tails = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)
    low, high = np.quantile(values, tails)
    return float(low), float(high)


def excludes_zero(low, high):
    return low > 0 or high < 0


def measure(rows, rng, replicates=config.BOOTSTRAP_N):
    start, end = config.AQUA_BIAS_YEARS
    selected = [r for r in rows if start <= r['year'] <= end]
    summary = {}
    for region in sorted({r['region'] for r in selected}):
        regional = [r for r in selected if r['region'] == region]
        point = statistics(regional)
        draws = year_bootstrap(regional, rng, replicates)
        bounds = [interval(draws[:, k]) for k in range(4)]
        years = sorted({r['year'] for r in regional})
        months = sorted({r['month'] for r in regional})
        summary[region] = dict(
            region=region, years=[start, end], bias=point[0],
            bias_low=bounds[0][0], bias_high=bounds[0][1],
            significant=excludes_zero(*bounds[0]),
            high_season=point[1], high_season_low=bounds[1][0], high_season_high=bounds[1][1],
            low_season=point[2], low_season_low=bounds[2][0], low_season_high=bounds[2][1],
            season_difference=point[3], season_difference_low=bounds[3][0],
            season_difference_high=bounds[3][1],
            seasonal=bounds[1][0] > bounds[2][1] or bounds[2][0] > bounds[1][1],
            annual=[dict(year=y, bias=pooled_log_ratio([r for r in regional if r['year'] == y]))
                    for y in years],
            monthly=[dict(month=m, bias=pooled_log_ratio([r for r in regional if r['month'] == m]))
                     for m in months if sum(r['actual'] for r in regional if r['month'] == m) > 0
                     and sum(r['predicted'] for r in regional if r['month'] == m) > 0],
        )
    return summary


def applied_bias(row, month):
    if not config.AQUA_BIAS_CORRECTION or not row['significant']:
        return 0.0
    if row['seasonal']:
        return row['high_season'] if season_of(month) == 'high' else row['low_season']
    return row['bias']


def correction_factors(summary):
    return {(region, month): float(np.exp(-applied_bias(row, month)))
            for region, row in summary.items() for month in range(1, 13)}


def corrected(rows, factors):
    return [dict(r, predicted=r['predicted'] * factors[(r['region'], r['month'])]) for r in rows]
