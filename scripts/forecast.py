import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, RidgeCV

import config
from build_series import SERIES_FIELDS, write_json


SERIES_PATH = config.PROCESSED_DIR / 'series.json'
METHOD_PATH = config.PROCESSED_DIR / 'methodology.json'
CLIMATE_PATH = config.INTERIM_DIR / 'climate_monthly.parquet'
UNITS = (*config.REGIONS, config.NATIONAL)
SEASON = 0
ROUND_DIGITS = 1
METRIC_DIGITS = 4
VARIANTS = {'fire_climate': ('fire', 'precip', 't2m'), 'fire_only': ('fire',)}
TAILS = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)
METHODS = ('model', 'climatology', 'persistence')


def to_index(year, month):
    return year * 12 + month - 1


def to_month(index):
    return index // 12, index % 12 + 1


def label(index):
    year, month = to_month(index)
    return f'{year:04d}-{month:02d}'


def split_series(rows):
    return [r for r in rows if not r['is_forecast']]


def partial_month(method):
    marks = [p['partial_through'][:7] for p in method.get('periods', []) if p.get('partial_through')]
    return max(marks) if marks else None


def fire_values(observed, field, partial):
    values = {u: {} for u in UNITS}
    for row in observed:
        index = to_index(row['year'], row['month'])
        if label(index) != partial and row[field] is not None:
            values[row['region']][index] = float(row[field])
    return values


def climate_values(frame):
    output = {}
    for unit, group in frame.groupby('region'):
        output[unit] = {to_index(int(y), int(m)): (p, t) for y, m, p, t in
                        group[['year', 'month', 'precip_mm_day', 't2m_c']].itertuples(index=False)}
    return output


def window_mean(values, end, size, position):
    months = range(end - size + 1, end + 1)
    if any(m not in values for m in months):
        return np.nan
    return float(np.mean([values[m][position] for m in months]))


def features(fire, climate, origin):
    months = range(origin - config.FORECAST_FIRE_WINDOW + 1, origin + 1)
    if any(m not in fire for m in months):
        return None
    end = origin - config.FORECAST_CLIMATE_LAG
    return dict(origin_year=to_month(origin)[0], origin_month=to_month(origin)[1],
                fire=float(np.log(sum(fire[m] for m in months) + config.FORECAST_LOG_OFFSET)),
                precip=window_mean(climate, end, config.FORECAST_CLIMATE_WINDOW, 0),
                t2m=window_mean(climate, end, config.FORECAST_CLIMATE_WINDOW, 1))


def monthly_samples(fire, climate, lead, targets):
    rows = []
    for target in targets:
        values = features(fire, climate, target - lead)
        if values is not None:
            year, month = to_month(target)
            rows.append(dict(year=year, key=month, target=target, value=fire.get(target, np.nan), **values))
    return pd.DataFrame(rows)


def season_value(fire, year):
    months = [to_index(year, m) for m in config.FORECAST_SEASON_MONTHS]
    return sum(fire[m] for m in months) if all(m in fire for m in months) else np.nan


def season_samples(fire, climate, years):
    rows = []
    for year in years:
        values = features(fire, climate, to_index(year, config.FORECAST_SEASON_ORIGIN))
        if values is not None:
            rows.append(dict(year=year, key=SEASON, target=to_index(year, config.FORECAST_SEASON_MONTHS[0]),
                             value=season_value(fire, year), **values))
    return pd.DataFrame(rows)


def log_value(values):
    return np.log(np.asarray(values, dtype=float) + config.FORECAST_LOG_OFFSET)


def classify(value, reference):
    thresholds = np.percentile(reference, config.ANOMALY_PERCENTILES)
    return ('low' if value < thresholds[0] else 'normal' if value <= thresholds[1] else
            'high' if value <= thresholds[2] else 'very_high')


def fit_predict(train, test, predictors):
    medians = train.groupby('key')['value'].median()
    climatology = pd.Series(log_value(medians), index=medians.index)
    stats = train.groupby('origin_month').agg(fire=('fire', 'median'), precip_mean=('precip', 'mean'),
                                              precip_std=('precip', 'std'), t2m_mean=('t2m', 'mean'),
                                              t2m_std=('t2m', 'std'))

    def design(frame):
        s = stats.loc[frame['origin_month']].reset_index(drop=True)
        columns = {'fire': frame['fire'].to_numpy() - s['fire'].to_numpy(),
                   'precip': (frame['precip'].to_numpy() - s['precip_mean'].to_numpy()) / s['precip_std'].to_numpy(),
                   't2m': (frame['t2m'].to_numpy() - s['t2m_mean'].to_numpy()) / s['t2m_std'].to_numpy()}
        return np.column_stack([columns[p] for p in predictors])

    train_x = design(train)
    keep = np.isfinite(train_x).all(axis=1)
    target = log_value(train['value']) - climatology.loc[train['key']].to_numpy()
    model = RidgeCV(alphas=config.FORECAST_RIDGE_ALPHAS).fit(train_x[keep], target[keep])
    test_x = design(test)
    if not np.isfinite(test_x).all():
        raise ValueError('Missing predictors for forecast samples.')
    base = climatology.loc[test['key']].to_numpy()
    return dict(model=base + model.predict(test_x), climatology=base, persistence=base + test_x[:, 0],
                alpha=float(model.alpha_), coefficients=[float(c) for c in model.coef_])


def history_mask(frame, years=config.HISTORY_YEARS):
    return frame['year'].between(*years) & frame['value'].notna()


def backtest(frame, predictors):
    history = frame[history_mask(frame)].reset_index(drop=True)
    parts = []
    for year in sorted(history['year'].unique()):
        test = history[history['year'] == year]
        train = history[(history['year'] != year) & (history['origin_year'] != year)]
        predicted = fit_predict(train, test, predictors)
        part = test[['year', 'key', 'value']].copy()
        part['observed'] = log_value(test['value'])
        for name in METHODS:
            part[name] = predicted[name]
        references = {k: g['value'].to_numpy() for k, g in train.groupby('key')}
        part['clim_low'] = [log_value(np.quantile(references[k], TAILS[0])) for k in part['key']]
        part['clim_high'] = [log_value(np.quantile(references[k], TAILS[1])) for k in part['key']]
        for name in ('observed', *METHODS):
            values = np.expm1(part[name]) if name != 'observed' else part['value']
            part[f'class_{name}'] = [classify(v, references[k]) for v, k in zip(values, part['key'])]
        parts.append(part)
    result = pd.concat(parts, ignore_index=True)
    result['residual'] = result['observed'] - result['model']
    lows, highs = [], []
    for row in result.itertuples():
        others = result[(result['key'] == row.key) & (result['year'] != row.year)]['residual']
        lows.append(row.model + np.quantile(others, TAILS[0]))
        highs.append(row.model + np.quantile(others, TAILS[1]))
    result['low'], result['high'] = lows, highs
    return result


def summarize(result):
    output = dict(n=int(len(result)))
    for name in METHODS:
        output[f'mae_log_{name}'] = round(float(np.mean(np.abs(result['observed'] - result[name]))), METRIC_DIGITS)
        output[f'class_hit_{name}'] = round(float(np.mean(result[f'class_{name}'] == result['class_observed'])), METRIC_DIGITS)
    output['coverage_model'] = round(float(np.mean((result['observed'] >= result['low']) & (result['observed'] <= result['high']))), METRIC_DIGITS)
    output['coverage_climatology'] = round(float(np.mean((result['observed'] >= result['clim_low']) & (result['observed'] <= result['clim_high']))), METRIC_DIGITS)
    output['skill_vs_climatology'] = round(1 - output['mae_log_model'] / output['mae_log_climatology'], METRIC_DIGITS)
    return output


def unit_frames(fire, climate, unit, last_year):
    targets = [to_index(y, m) for y in range(config.HISTORY_YEARS[0], last_year + 1) for m in range(1, 13)]
    frames = {lead: monthly_samples(fire[unit], climate[unit], lead, targets) for lead in config.FORECAST_LEADS}
    frames[SEASON] = season_samples(fire[unit], climate[unit], range(config.HISTORY_YEARS[0], last_year + 1))
    return frames


def run_backtests(frames, predictors):
    results, rows = {}, []
    for unit in UNITS:
        for lead, frame in frames[unit].items():
            result = backtest(frame, predictors)
            results[(unit, lead)] = result
            rows.append(dict(region=unit, target='season' if lead == SEASON else 'month',
                             lead=config.FORECAST_SEASON_MONTHS[0] - config.FORECAST_SEASON_ORIGIN if lead == SEASON else lead,
                             **summarize(result)))
    return results, rows


def interval(result, key, prediction):
    residuals = result[result['key'] == key]['residual']
    return prediction + np.quantile(residuals, TAILS[0]), prediction + np.quantile(residuals, TAILS[1])


def round_value(value):
    return round(float(value), ROUND_DIGITS)


def out_of_sample(frames, results, observed, predictors):
    rows = []
    year = config.FORECAST_OOS_YEAR
    for unit in UNITS:
        for month in config.FORECAST_SEASON_MONTHS:
            lead = month - config.FORECAST_SEASON_ORIGIN
            rows.append(oos_row(unit, frames[unit][lead], results[(unit, lead)], year, month, lead, observed, predictors))
        rows.append(oos_row(unit, frames[unit][SEASON], results[(unit, SEASON)], year, SEASON,
                            config.FORECAST_SEASON_MONTHS[0] - config.FORECAST_SEASON_ORIGIN, observed, predictors))
    return rows


def oos_row(unit, frame, result, year, key, lead, observed, predictors):
    train = frame[history_mask(frame)]
    test = frame[(frame['year'] == year) & (frame['key'] == key)]
    if len(test) != 1:
        raise ValueError(f'Missing out-of-sample predictors for {unit} {year} {key}.')
    predicted = fit_predict(train, test, predictors)
    low, high = interval(result, key, predicted['model'][0])
    reference = train[train['key'] == key]['value'].to_numpy()
    value = float(test['value'].iloc[0])
    median = float(np.expm1(predicted['model'][0]))
    return dict(region=unit, target='season' if key == SEASON else f'{year:04d}-{key:02d}', lead=lead,
                origin=f'{year:04d}-{config.FORECAST_SEASON_ORIGIN:02d}',
                predicted=round_value(max(median, 0)), predicted_low=round_value(max(np.expm1(low), 0)),
                predicted_high=round_value(np.expm1(high)),
                climatology=round_value(np.expm1(predicted['climatology'][0])),
                climatology_low=round_value(np.quantile(reference, TAILS[0])),
                climatology_high=round_value(np.quantile(reference, TAILS[1])),
                persistence=round_value(np.expm1(predicted['persistence'][0])),
                observed=round_value(value), observed_inside=bool(np.expm1(low) <= value <= np.expm1(high)),
                predicted_class=classify(median, reference), observed_class=classify(value, reference),
                abs_log_error_model=round(float(abs(log_value(value) - predicted['model'][0])), METRIC_DIGITS),
                abs_log_error_climatology=round(float(abs(log_value(value) - predicted['climatology'][0])), METRIC_DIGITS),
                abs_log_error_persistence=round(float(abs(log_value(value) - predicted['persistence'][0])), METRIC_DIGITS))


def demo(observed, partial, climate, predictors, last_year):
    output = {'train_years': list(config.FORECAST_DEMO_TRAIN_YEARS), 'test_years': list(config.FORECAST_DEMO_TEST_YEARS),
              'cross_2012': [], 'trend': []}
    for field in ('raw_detections', 'estimated'):
        fire = fire_values(observed, field, partial)
        for unit in UNITS:
            frames = unit_frames(fire, climate, unit, last_year)
            for lead in (1, SEASON):
                frame = frames[lead]
                train = frame[history_mask(frame, config.FORECAST_DEMO_TRAIN_YEARS)]
                test = frame[history_mask(frame, config.FORECAST_DEMO_TEST_YEARS)]
                predicted = fit_predict(train, test, predictors)
                errors = log_value(test['value']) - predicted['model']
                output['cross_2012'].append(dict(
                    series=field, region=unit, target='season' if lead == SEASON else 'month', lead=lead if lead else
                    config.FORECAST_SEASON_MONTHS[0] - config.FORECAST_SEASON_ORIGIN, n=int(len(test)),
                    mae_log_model=round(float(np.mean(np.abs(errors))), METRIC_DIGITS),
                    mae_log_climatology=round(float(np.mean(np.abs(log_value(test['value']) - predicted['climatology']))), METRIC_DIGITS),
                    median_observed_over_predicted=round(float(np.exp(np.median(errors))), METRIC_DIGITS)))
            season = frames[SEASON]
            season = season[history_mask(season)]
            fit = LinearRegression().fit(season[['year']].to_numpy(dtype=float), log_value(season['value']))
            span = config.HISTORY_YEARS[1] - config.HISTORY_YEARS[0]
            output['trend'].append(dict(series=field, region=unit, years=list(config.HISTORY_YEARS),
                                        pct_per_year=round(100 * float(np.expm1(fit.coef_[0])), 2),
                                        fitted_last_over_first=round(float(np.exp(fit.coef_[0] * span)), METRIC_DIGITS)))
    return output


def forecast_rows(fire, climate, frames, results, summaries, observed, last_complete, predictors):
    history = {}
    for row in observed:
        if config.HISTORY_YEARS[0] <= row['year'] <= config.HISTORY_YEARS[1]:
            history.setdefault((row['region'], row['month']), []).append(row['estimated'])
    last_observed = max(to_index(r['year'], r['month']) for r in observed)
    skill = {(s['region'], s['lead']): s for s in summaries if s['target'] == 'month'}
    rows, published = [], []
    for target in range(last_observed + 1, to_index(config.LAST_YEAR, 12) + 1):
        lead = target - last_complete
        if lead not in config.FORECAST_LEADS:
            continue
        year, month = to_month(target)
        for unit in UNITS:
            reference = history[(unit, month)]
            beats = skill[(unit, lead)]['mae_log_model'] < skill[(unit, lead)]['mae_log_climatology']
            if beats:
                frame = frames[unit][lead]
                sample = monthly_samples(fire[unit], climate[unit], lead, [target])
                predicted = fit_predict(frame[history_mask(frame)], sample, predictors)['model'][0]
                low, high = interval(results[(unit, lead)], month, predicted)
                median, low, high = max(np.expm1(predicted), 0), max(np.expm1(low), 0), np.expm1(high)
            else:
                median = float(np.median(reference))
                low, high = np.quantile(reference, TAILS)
            median = round_value(median)
            values = (unit, year, month, None, None, None, median, round_value(min(low, median)),
                      round_value(max(high, median)), None, 'forecast', round_value(np.median(reference)),
                      classify(median, reference), True)
            rows.append(dict(zip(SERIES_FIELDS, values)))
            published.append(dict(region=unit, month=label(target), lead=lead, origin=label(last_complete),
                                  method='model' if beats else 'climatology'))
    return rows, published


def main():
    rows = json.loads(SERIES_PATH.read_text())
    method = json.loads(METHOD_PATH.read_text())
    observed = split_series(rows)
    partial = partial_month(method)
    climate_frame = pd.read_parquet(CLIMATE_PATH)
    climate = climate_values(climate_frame)
    fire = fire_values(observed, 'estimated', partial)
    last_complete = max(max(v) for v in fire.values())
    last_year = to_month(last_complete)[0]
    frames = {u: unit_frames(fire, climate, u, last_year) for u in UNITS}
    backtests = {}
    for name, predictors in VARIANTS.items():
        backtests[name] = run_backtests(frames, predictors)
    scores = {name: float(np.mean([r['mae_log_model'] for r in rows_])) for name, (_, rows_) in backtests.items()}
    selected = min(scores, key=scores.get)
    predictors = VARIANTS[selected]
    results, summaries = backtests[selected]
    oos = out_of_sample(frames, results, observed, predictors)
    raw_vs_corrected = demo(observed, partial, climate, predictors, last_year)
    new_rows, published = forecast_rows(fire, climate, frames, results, summaries, observed, last_complete, predictors)
    coefficients = []
    for unit in UNITS:
        for lead, frame in frames[unit].items():
            fitted = fit_predict(frame[history_mask(frame)], frame[history_mask(frame)].head(1), predictors)
            coefficients.append(dict(region=unit, target='season' if lead == SEASON else 'month', lead=lead or
                                     config.FORECAST_SEASON_MONTHS[0] - config.FORECAST_SEASON_ORIGIN,
                                     alpha=fitted['alpha'], coefficients=dict(zip(predictors, [round(c, METRIC_DIGITS) for c in fitted['coefficients']]))))
    climate_last = climate_frame.sort_values(['year', 'month']).iloc[-1]
    method['forecast'] = dict(
        model='Ridge regression on log anomalies (RidgeCV, inner leave-one-out alpha), one model per region and lead pooled over target months; one season model per region.',
        variant=selected,
        predictors=list(predictors),
        target='log(estimated + offset) minus the training median of the same calendar month; season = sum of estimated over the season months.',
        params=dict(leads=list(config.FORECAST_LEADS), fire_window_months=config.FORECAST_FIRE_WINDOW,
                    climate_window_months=config.FORECAST_CLIMATE_WINDOW, climate_lag_months=config.FORECAST_CLIMATE_LAG,
                    log_offset=config.FORECAST_LOG_OFFSET, ridge_alphas=list(config.FORECAST_RIDGE_ALPHAS),
                    season_months=list(config.FORECAST_SEASON_MONTHS), season_origin_month=config.FORECAST_SEASON_ORIGIN,
                    ci_level=config.CI_LEVEL, history_years=list(config.HISTORY_YEARS)),
        climate=dict(source='NASA POWER monthly point API (community AG): PRECTOTCORR, T2M', points={
            u: int(climate_frame[climate_frame['region'] == u]['n_points'].iloc[0]) for u in UNITS},
            first=f"{int(climate_frame['year'].min())}-01", last=f"{int(climate_last['year'])}-{int(climate_last['month']):02d}",
            grid_deg=config.POWER_GRID_DEG),
        origin=label(last_complete),
        excluded_partial_month=partial,
        variant_scores={k: round(v, METRIC_DIGITS) for k, v in scores.items()},
        backtest=dict(scheme='leave-one-year-out', years=list(config.HISTORY_YEARS), by_region=summaries),
        backtest_other_variants=[dict(variant=k, by_region=v[1]) for k, v in backtests.items() if k != selected],
        coefficients=coefficients,
        out_of_sample=dict(year=config.FORECAST_OOS_YEAR, by_region=oos),
        raw_vs_corrected=raw_vs_corrected,
        published=published,
        definitions=dict(
            climatology='Median of the same calendar month (or season total) in the training years; range = empirical quantiles at ci_level.',
            persistence='Climatology shifted by the log anomaly of the fire window ending at the origin.',
            interval='Model prediction plus empirical quantiles at ci_level of leave-one-year-out residuals of the same target month and lead (other years only in the backtest).',
            class_hit='Share of cases where the anomaly class of the median matches the observed class; thresholds from training years.',
            out_of_sample='Fitted on 2003-2025 only. 2026 August-October observations are near-real-time (provisional).',
            partial_month='The partial month is never used as a target or predictor; the origin is the last complete month.',
            published='Rows only after the last observed month, within the contract years, and only at leads where the model beats climatology in the backtest; otherwise climatology.'))
    series = observed + new_rows
    if series[:len(observed)] != observed:
        raise ValueError('Observed rows changed.')
    write_json(SERIES_PATH, series)
    write_json(METHOD_PATH, method)
    print(json.dumps(dict(variant_scores=scores, selected=selected, backtest=summaries, out_of_sample=oos,
                          raw_vs_corrected=raw_vs_corrected, published=published, coefficients=coefficients), indent=1))


if __name__ == '__main__':
    main()
