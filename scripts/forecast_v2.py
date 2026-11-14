import calendar
import itertools
import json
import urllib.request

import numpy as np
import pandas as pd
from scipy.stats import norm
from shapely.geometry import box, shape
from shapely.strtree import STRtree

import config
from build_series import write_json
from forecast import TAILS, classify, label, partial_month, split_series, to_index, to_month


SERIES_PATH = config.PROCESSED_DIR / 'series.json'
METHOD_PATH = config.PROCESSED_DIR / 'methodology.json'
MAP_PATH = config.PROCESSED_DIR / 'map.parquet'
REGIONS_PATH = config.PROCESSED_DIR / 'regions.geojson'
OUTPUT_PATH = config.PROCESSED_DIR / 'forecast.json'
CLIMATE_PATH = config.INTERIM_DIR / 'climate_monthly.parquet'
CELLS_PATH = config.INTERIM_DIR / 'cell_departments.parquet'
ONI_PATH = config.ENSO_DIR / 'oni.ascii.txt'
ICEN_PATH = config.ENSO_DIR / 'ICEN.txt'
USER_AGENT = 'climate-index-client/1.0'
CLASSES = ('low', 'normal', 'high', 'very_high')
CLIMATOLOGY_PROBS = tuple(np.diff([0, *config.ANOMALY_PERCENTILES, 100]) / 100)
SELECTED_IN_CV = 'selected_in_cv'
ONI_SEASONS = ('DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ')
DIGITS = 4
FIRST_SEASON_MONTH = config.FORECAST_SEASON_MONTHS[0]


def download(url, path):
    if path.exists():
        return False
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return True


def parse_oni(text):
    values = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[0] in ONI_SEASONS:
            values[to_index(int(parts[1]), ONI_SEASONS.index(parts[0]) + 1)] = float(parts[3])
    return values


def parse_icen(text):
    values = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 3 and not line.lstrip().startswith('%'):
            values[to_index(int(parts[0]), int(parts[1]))] = float(parts[2])
    return values


def load_enso():
    download(config.ONI_URL, ONI_PATH)
    download(config.ICEN_URL, ICEN_PATH)
    return {'oni': parse_oni(ONI_PATH.read_text()), 'icen': parse_icen(ICEN_PATH.read_text(encoding='latin-1'))}


def department_features():
    collection = json.loads(REGIONS_PATH.read_text())
    return [f for f in collection['features'] if f['properties']['level'] == 'department']


def assign_cells(cells, features):
    shapes = [shape(f['geometry']) for f in features]
    ids = [f['properties']['id'] for f in features]
    macros = [f['properties']['macroregion'] for f in features]
    tree = STRtree(shapes)
    half = config.GRID_DEG / 2
    rows = []
    for lat, lon, region in cells[['lat', 'lon', 'region']].itertuples(index=False):
        cell = box(lon - half, lat - half, lon + half, lat + half)
        overlaps = [(shapes[i].intersection(cell).area, ids[i], macros[i]) for i in tree.query(cell)]
        overlaps = [o for o in overlaps if o[0] > 0]
        best = max(overlaps, default=None)
        inside = [o for o in overlaps if o[2] == region]
        if inside:
            chosen = max(inside)[1]
        else:
            centre = cell.centroid
            chosen = min((shapes[i].distance(centre), ids[i]) for i in range(len(ids)) if macros[i] == region)[1]
        rows.append(dict(lat=lat, lon=lon, region=region, department=chosen,
                         unconstrained=best[1] if best else None))
    return pd.DataFrame(rows)


def cell_departments(frame):
    cells = frame[['lat', 'lon', 'region']].drop_duplicates().reset_index(drop=True)
    if CELLS_PATH.exists():
        cached = pd.read_parquet(CELLS_PATH)
        if len(cached.merge(cells, on=['lat', 'lon', 'region'])) == len(cells) == len(cached):
            return cached
    assigned = assign_cells(cells, department_features())
    CELLS_PATH.parent.mkdir(parents=True, exist_ok=True)
    assigned.to_parquet(CELLS_PATH, index=False)
    return assigned


def series_fire(observed, partial):
    values = {}
    for row in observed:
        index = to_index(row['year'], row['month'])
        if label(index) != partial:
            values.setdefault(row['region'], {})[index] = float(row['estimated'])
    return values


def department_fire(frame, cells, months, partial):
    merged = frame.merge(cells[['lat', 'lon', 'department']], on=['lat', 'lon'])
    totals = merged.groupby(['department', 'year', 'month'])['estimated'].sum()
    values = {d: {m: 0.0 for m in months} for d in cells['department'].unique()}
    for (department, year, month), value in totals.items():
        index = to_index(int(year), int(month))
        if index in months and label(index) != partial:
            values[department][index] = float(value)
    return values


def check_sums(macro_fire, departments, macro_of):
    worst_abs, worst_rel = 0.0, 0.0
    for macro in config.REGIONS:
        members = [d for d, m in macro_of.items() if m == macro]
        for index, value in macro_fire[macro].items():
            total = sum(departments[d].get(index, 0.0) for d in members)
            worst_abs = max(worst_abs, abs(total - value))
            if value > 0:
                worst_rel = max(worst_rel, abs(total - value) / value)
    return dict(max_abs_diff=round(worst_abs, 2), max_rel_diff=round(worst_rel, 6))


def precipitation(frame):
    output = {}
    for unit, group in frame.groupby('region'):
        output[unit] = {to_index(int(y), int(m)): p * calendar.monthrange(int(y), int(m))[1]
                        for y, m, p in group[['year', 'month', 'precip_mm_day']].itertuples(index=False)}
    return output


def window_sum(values, end, size):
    months = range(end - size + 1, end + 1)
    if any(m not in values for m in months):
        return np.nan
    return float(sum(values[m] for m in months))


def season_total(fire, year):
    return window_sum(fire, to_index(year, config.FORECAST_SEASON_MONTHS[-1]), len(config.FORECAST_SEASON_MONTHS))


def log_value(value):
    return np.log(np.asarray(value, dtype=float) + config.FORECAST_LOG_OFFSET)


def sample(fire, rain, enso, year, lead):
    origin = to_index(year, FIRST_SEASON_MONTH) - lead
    window = window_sum(fire, origin, config.FORECAST_FIRE_WINDOW)
    if np.isnan(window):
        return None
    row = dict(year=year, origin_year=to_month(origin)[0], origin=label(origin), value=season_total(fire, year),
               fire=float(log_value(window)))
    centre = origin - config.FORECAST_ENSO_LAG - 1
    for name in config.FORECAST_ENSO_INDICES:
        row[name] = enso[name].get(centre, np.nan)
    for size in config.FORECAST_DROUGHT_WINDOWS:
        row[f'spi{size}'] = float(np.log1p(window_sum(rain, origin - config.FORECAST_DROUGHT_LAG, size)))
    return row


def samples(fire, rain, enso, lead, years):
    rows = [sample(fire, rain, enso, y, lead) for y in years]
    return pd.DataFrame([r for r in rows if r is not None]).reset_index(drop=True)


def candidate_sets(groups):
    options = {'enso': config.FORECAST_ENSO_INDICES, 'drought': tuple(f'spi{s}' for s in config.FORECAST_DROUGHT_WINDOWS)}
    return [('fire', *combo) for combo in itertools.product(*(options[g] for g in groups))]


def variant_candidates():
    output = {name: candidate_sets(groups) for name, groups in config.FORECAST_VARIANT_GROUPS.items()}
    output[SELECTED_IN_CV] = list(dict.fromkeys(c for sets in output.values() for c in sets))
    return output


def standardize(x):
    mean, std = x.mean(axis=0), x.std(axis=0)
    std[std == 0] = 1.0
    return (x - mean) / std, mean, std


def choose_alpha(x, y):
    z, _, _ = standardize(x)
    u, s, _ = np.linalg.svd(z, full_matrices=False)
    alphas = np.asarray(config.FORECAST_RIDGE_ALPHAS)[:, None]
    shrink = s ** 2 / (s ** 2 + alphas)
    uy = u.T @ (y - y.mean())
    fitted = (shrink * uy) @ u.T
    leverage = shrink @ (u ** 2).T + 1 / len(y)
    loo = ((y - y.mean()) - fitted) / (1 - leverage)
    return float(alphas[int(np.argmin((loo ** 2).mean(axis=1))), 0])


def ridge(x, y, alpha):
    z, mean, std = standardize(x)
    centre = y.mean()
    coef = np.linalg.solve(z.T @ z + alpha * np.eye(z.shape[1]), z.T @ (y - centre))
    return lambda new: centre + ((new - mean) / std) @ coef


def usable(frame, year):
    return (frame['year'] != year) & (frame['origin_year'] != year)


def loo_residuals(frame, columns):
    x, y = frame[list(columns)].to_numpy(dtype=float), log_value(frame['value'])
    alpha = choose_alpha(x, y)
    years, origins = frame['year'].to_numpy(), frame['origin_year'].to_numpy()
    keep = ((years[None, :] != years[:, None]) & (origins[None, :] != years[:, None])).astype(float)
    count = keep.sum(axis=1)
    mean_x = keep @ x / count[:, None]
    std_x = np.sqrt(np.maximum(keep @ x ** 2 / count[:, None] - mean_x ** 2, 0))
    std_x[std_x == 0] = 1.0
    mean_y = keep @ y / count
    sxx = np.einsum('fi,ij,ik->fjk', keep, x, x) - count[:, None, None] * mean_x[:, :, None] * mean_x[:, None, :]
    sxy = np.einsum('fi,ij,i->fj', keep, x, y) - count[:, None] * mean_x * mean_y[:, None]
    gram = sxx / (std_x[:, :, None] * std_x[:, None, :]) + alpha * np.eye(x.shape[1])
    coef = np.linalg.solve(gram, (sxy / std_x)[:, :, None])[:, :, 0]
    predicted = mean_y + np.sum((x - mean_x) / std_x * coef, axis=1)
    return y - predicted, alpha


def fit_forecast(train, test, candidates, cache=None):
    scores = {}
    for columns in candidates:
        key = (tuple(train['year']), columns)
        if cache is not None and key in cache:
            scores[columns] = cache[key]
        else:
            scores[columns] = loo_residuals(train, columns)
            if cache is not None:
                cache[key] = scores[columns]
    chosen = min(candidates, key=lambda c: (float(np.mean(scores[c][0] ** 2)), len(c)))
    residuals, alpha = scores[chosen]
    predict = ridge(train[list(chosen)].to_numpy(dtype=float), log_value(train['value']), alpha)
    mean = predict(test[list(chosen)].to_numpy(dtype=float))
    spread = float(np.sqrt(np.mean(residuals ** 2)))
    return mean, spread, chosen


def thresholds(reference):
    return np.percentile(reference, config.ANOMALY_PERCENTILES)


def class_probabilities(mean, spread, reference):
    cuts = norm.cdf((log_value(thresholds(reference)) - mean) / spread)
    return np.diff([0.0, *cuts, 1.0])


def rps(probs, observed_class):
    observed = np.zeros(len(CLASSES))
    observed[CLASSES.index(observed_class)] = 1.0
    return float(np.sum((np.cumsum(probs)[:-1] - np.cumsum(observed)[:-1]) ** 2))


def climatology(reference):
    low, high = np.quantile(reference, TAILS)
    return float(np.median(reference)), float(low), float(high)


def evaluate(frame, candidates, cache):
    history = frame[frame['year'].between(*config.HISTORY_YEARS) & frame['value'].notna()].reset_index(drop=True)
    rows = []
    z = norm.ppf(TAILS[1])
    for year in history['year']:
        train = history[usable(history, year)].reset_index(drop=True)
        test = history[history['year'] == year]
        mean, spread, chosen = fit_forecast(train, test, candidates, cache)
        reference = train['value'].to_numpy()
        value = float(test['value'].iloc[0])
        observed = float(log_value(value))
        observed_class = classify(value, reference)
        probs = class_probabilities(mean[0], spread, reference)
        clim_median, clim_low, clim_high = climatology(reference)
        rows.append(dict(
            year=int(year), chosen='+'.join(chosen), observed=observed, model=float(mean[0]),
            climatology=float(log_value(clim_median)),
            inside_model=bool(mean[0] - z * spread <= observed <= mean[0] + z * spread),
            inside_climatology=bool(clim_low <= value <= clim_high),
            rps_model=rps(probs, observed_class), rps_climatology=rps(CLIMATOLOGY_PROBS, observed_class),
            hit_model=CLASSES[int(np.argmax(probs))] == observed_class,
            hit_climatology=classify(clim_median, reference) == observed_class))
    return pd.DataFrame(rows)


def summarize(result):
    mae_model = float(np.mean(np.abs(result['observed'] - result['model'])))
    mae_clim = float(np.mean(np.abs(result['observed'] - result['climatology'])))
    rps_model, rps_clim = float(result['rps_model'].mean()), float(result['rps_climatology'].mean())
    return dict(
        n=int(len(result)), mae_log_model=round(mae_model, DIGITS), mae_log_climatology=round(mae_clim, DIGITS),
        mae_skill=round(1 - mae_model / mae_clim, DIGITS), rps_model=round(rps_model, DIGITS),
        rps_climatology=round(rps_clim, DIGITS), rpss=round(1 - rps_model / rps_clim, DIGITS),
        coverage_model=round(float(result['inside_model'].mean()), DIGITS),
        coverage_climatology=round(float(result['inside_climatology'].mean()), DIGITS),
        class_hit_model=round(float(result['hit_model'].mean()), DIGITS),
        class_hit_climatology=round(float(result['hit_climatology'].mean()), DIGITS),
        chosen=result['chosen'].value_counts().to_dict())


def has_skill(summary):
    return summary['rpss'] >= config.FORECAST_MIN_RPSS and summary['mae_skill'] > config.FORECAST_MIN_MAE_SKILL


def round_value(value):
    return round(float(value), 1)


def outlook(frame, year, candidates, method):
    history = frame[frame['year'].between(*config.HISTORY_YEARS) & frame['value'].notna()].reset_index(drop=True)
    test = frame[frame['year'] == year]
    if len(test) != 1:
        raise ValueError(f'Missing predictors for season {year}.')
    reference = history['value'].to_numpy()
    clim_median, clim_low, clim_high = climatology(reference)
    output = dict(origin=test['origin'].iloc[0], hist_median=round_value(clim_median),
                  thresholds=[round_value(t) for t in thresholds(reference)])
    if method == 'model':
        mean, spread, chosen = fit_forecast(history, test, candidates)
        z = norm.ppf(TAILS[1])
        median, low, high = (float(np.expm1(v)) for v in (mean[0], mean[0] - z * spread, mean[0] + z * spread))
        probs = class_probabilities(mean[0], spread, reference)
        output.update(predictors=list(chosen), spread_log=round(spread, DIGITS))
    else:
        median, low, high = clim_median, clim_low, clim_high
        probs = np.asarray(CLIMATOLOGY_PROBS)
    output.update(median=round_value(max(median, 0)), low=round_value(max(min(low, median), 0)),
                  high=round_value(max(high, median)),
                  probabilities={c: round(float(p), 3) for c, p in zip(CLASSES, probs)},
                  most_likely_class=CLASSES[int(np.argmax(probs))],
                  median_class=classify(max(median, 0), reference))
    observed = test['value'].iloc[0]
    if pd.notna(observed):
        output.update(observed=round_value(observed), observed_class=classify(float(observed), reference),
                      observed_inside=bool(low <= observed <= high))
    return output


def units(features):
    output = [dict(region=config.NATIONAL, name=config.REGION_NAME, level='country', macroregion=None)]
    output += [dict(region=r, name=config.MACROREGION_NAMES[r], level='macro', macroregion=None) for r in config.REGIONS]
    output += [dict(region=f['properties']['id'], name=f['properties']['name'], level='department',
                    macroregion=f['properties']['macroregion']) for f in features]
    return output


def build(series_rows, method, map_frame, climate_frame, enso):
    observed = split_series(series_rows)
    partial = partial_month(method)
    fire = series_fire(observed, partial)
    months = set(fire[config.NATIONAL])
    features = department_features()
    cells = cell_departments(map_frame)
    departments = department_fire(map_frame, cells, months, partial)
    macro_of = {f['properties']['id']: f['properties']['macroregion'] for f in features}
    fire.update(departments)
    rain = precipitation(climate_frame)
    last_complete = max(months)
    origin_year, origin_month = to_month(last_complete)
    target_year = origin_year + (1 if origin_month >= FIRST_SEASON_MONTH else 0)
    outlook_lead = to_index(target_year, FIRST_SEASON_MONTH) - last_complete
    years = range(config.HISTORY_YEARS[0], target_year + 1)
    candidates = variant_candidates()
    unit_list = units(features)
    for unit in unit_list:
        history = [season_total(fire[unit['region']], y) for y in range(config.HISTORY_YEARS[0], config.HISTORY_YEARS[1] + 1)]
        unit['season_median_2003_2025'] = round_value(np.median(history))
        unit['active'] = bool(unit['level'] != 'department' or np.median(history) >= config.FORECAST_DEPARTMENT_MIN_SEASON)
    backtest, results = [], {}
    for unit in [u for u in unit_list if u['active']]:
        climate_unit = unit['macroregion'] or unit['region']
        for lead in config.FORECAST_SEASON_LEADS:
            frame = samples(fire[unit['region']], rain[climate_unit], enso, lead, years)
            cache = {}
            for variant, sets in candidates.items():
                if unit['level'] == 'department' and variant not in (config.FORECAST_DEFAULT_VARIANT, SELECTED_IN_CV):
                    continue
                summary = summarize(evaluate(frame, sets, cache))
                results[(unit['region'], lead, variant)] = (frame, summary)
                backtest.append(dict(region=unit['region'], level=unit['level'], variant=variant, lead=lead, **summary))
    return dict(fire=fire, departments=departments, macro_of=macro_of, cells=cells, unit_list=unit_list, rain=rain, enso=enso,
                backtest=backtest, results=results, candidates=candidates, last_complete=last_complete,
                target_year=target_year, outlook_lead=outlook_lead, partial=partial, years=years)


def choose_variant(results):
    def mean_score(variant, key):
        return float(np.mean([results[(r, lead, variant)][1][key] for r in config.REGIONS
                              for lead in config.FORECAST_SEASON_LEADS]))
    default = config.FORECAST_DEFAULT_VARIANT
    better = (mean_score(SELECTED_IN_CV, 'rpss') > mean_score(default, 'rpss') and
              mean_score(SELECTED_IN_CV, 'mae_skill') > mean_score(default, 'mae_skill'))
    scores = {v: dict(mean_rpss=round(mean_score(v, 'rpss'), DIGITS), mean_mae_skill=round(mean_score(v, 'mae_skill'), DIGITS))
              for v in (*config.FORECAST_VARIANT_GROUPS, SELECTED_IN_CV)}
    return (SELECTED_IN_CV if better else default), scores


def raw_vs_corrected(observed, partial, rain, enso, candidates):
    rows = []
    lead = config.FORECAST_SEASON_LEADS[0]
    years = range(config.HISTORY_YEARS[0], config.HISTORY_YEARS[1] + 1)
    for field in ('raw_detections', 'estimated'):
        fire = {}
        for row in observed:
            index = to_index(row['year'], row['month'])
            if label(index) != partial and row[field] is not None:
                fire.setdefault(row['region'], {})[index] = float(row[field])
        for unit in (config.NATIONAL, *config.REGIONS):
            frame = samples(fire[unit], rain[unit], enso, lead, years)
            train = frame[frame['year'].between(*config.FORECAST_DEMO_TRAIN_YEARS)].reset_index(drop=True)
            test = frame[frame['year'].between(*config.FORECAST_DEMO_TEST_YEARS)].reset_index(drop=True)
            mean, _, chosen = fit_forecast(train, test, candidates)
            errors = log_value(test['value']) - mean
            clim = log_value(np.median(train['value']))
            rows.append(dict(series=field, region=unit, lead=lead, n=int(len(test)), predictors=list(chosen),
                             mae_log_model=round(float(np.mean(np.abs(errors))), DIGITS),
                             mae_log_climatology=round(float(np.mean(np.abs(log_value(test['value']) - clim))), DIGITS),
                             median_observed_over_predicted=round(float(np.exp(np.median(errors))), DIGITS)))
    return dict(train_years=list(config.FORECAST_DEMO_TRAIN_YEARS), test_years=list(config.FORECAST_DEMO_TEST_YEARS),
                target='season', rows=rows)


def skill_entry(summary):
    return {k: summary[k] for k in ('n', 'rpss', 'mae_skill', 'coverage_model', 'coverage_climatology')}


def assemble(state, variant):
    candidates = state['candidates'][variant]
    fire, rain, enso = state['fire'], state['rain'], state['enso']
    target_year, outlook_lead = state['target_year'], state['outlook_lead']
    regions, out_of_sample = [], []
    for unit in state['unit_list']:
        entry = dict(unit)
        climate_unit = unit['macroregion'] or unit['region']
        if not unit['active']:
            entry.update(published=False, method=None,
                         reason=f"Median August-October activity in {config.HISTORY_YEARS[0]}-{config.HISTORY_YEARS[1]} is below "
                                f"{config.FORECAST_DEPARTMENT_MIN_SEASON} fire cell-days.")
            regions.append(entry)
            continue
        skill = {lead: state['results'][(unit['region'], lead, variant)][1] for lead in config.FORECAST_SEASON_LEADS}
        entry['skill_by_lead'] = [dict(lead=lead, **skill_entry(skill[lead])) for lead in config.FORECAST_SEASON_LEADS]
        frame = samples(fire[unit['region']], rain[climate_unit], enso, outlook_lead, range(config.HISTORY_YEARS[0], target_year + 1))
        method = 'model' if outlook_lead in skill and has_skill(skill[outlook_lead]) else 'climatology'
        season = outlook(frame, target_year, candidates, method)
        entry.update(published=True, method=method, reason=(
            'Model beats climatology in the leave-one-year-out backtest at this lead.' if method == 'model' else
            'No skill over climatology at this lead in the backtest; the climatology is published and labelled as such.'),
            target_year=target_year, lead=outlook_lead, **season)
        if outlook_lead in skill:
            entry['skill'] = skill_entry(skill[outlook_lead])
        regions.append(entry)
        for lead in config.FORECAST_SEASON_LEADS:
            frame = samples(fire[unit['region']], rain[climate_unit], enso, lead,
                            range(config.HISTORY_YEARS[0], config.FORECAST_OOS_YEAR + 1))
            for kind in ('model', 'climatology'):
                result = outlook(frame, config.FORECAST_OOS_YEAR, candidates, kind)
                out_of_sample.append(dict(region=unit['region'], level=unit['level'], lead=lead, kind=kind,
                                          published_method=kind == ('model' if has_skill(skill[lead]) else 'climatology'),
                                          **{k: result.get(k) for k in ('origin', 'predictors', 'median', 'low', 'high',
                                                                       'probabilities', 'most_likely_class', 'observed',
                                                                       'observed_class', 'observed_inside')}))
    backtest = [r for r in state['backtest'] if r['level'] != 'department' or r['variant'] == variant]
    return regions, out_of_sample, backtest


def metrics(regions, backtest, variant):
    selected = [r for r in backtest if r['variant'] == variant]
    by_lead = []
    for lead in config.FORECAST_SEASON_LEADS:
        for level in ('macro', 'department'):
            rows = [r for r in selected if r['lead'] == lead and r['level'] == level]
            by_lead.append(dict(lead=lead, level=level, units=len(rows), units_with_skill=sum(has_skill(r) for r in rows),
                                mean_rpss=round(float(np.mean([r['rpss'] for r in rows])), DIGITS),
                                mean_mae_skill=round(float(np.mean([r['mae_skill'] for r in rows])), DIGITS),
                                mean_coverage_model=round(float(np.mean([r['coverage_model'] for r in rows])), DIGITS)))
    departments = [r for r in regions if r['level'] == 'department']
    return dict(by_lead=by_lead, departments_total=len(departments),
                departments_published=sum(r['published'] for r in departments),
                departments_model=sorted(r['region'] for r in departments if r['method'] == 'model'),
                departments_climatology=sorted(r['region'] for r in departments if r['method'] == 'climatology'),
                departments_below_threshold=sorted(r['region'] for r in departments if not r['published']))


def main():
    series_rows = json.loads(SERIES_PATH.read_text())
    method = json.loads(METHOD_PATH.read_text())
    observed = split_series(series_rows)
    state = build(series_rows, method, pd.read_parquet(MAP_PATH), pd.read_parquet(CLIMATE_PATH), load_enso())
    variant, variant_scores = choose_variant(state['results'])
    regions, oos, backtest = assemble(state, variant)
    demo = raw_vs_corrected(observed, state['partial'], state['rain'], state['enso'], state['candidates'][variant])
    cells = state['cells']
    output = dict(
        unit='fire cell-days, sum of estimated over the season months',
        season_months=list(config.FORECAST_SEASON_MONTHS),
        origin=label(state['last_complete']),
        excluded_partial_month=state['partial'],
        target_year=state['target_year'],
        lead=state['outlook_lead'],
        classes=list(CLASSES),
        class_percentiles=list(config.ANOMALY_PERCENTILES),
        climatology_probabilities=dict(zip(CLASSES, [round(p, 3) for p in CLIMATOLOGY_PROBS])),
        ci_level=config.CI_LEVEL,
        history_years=list(config.HISTORY_YEARS),
        variant=variant,
        candidates=['+'.join(c) for c in state['candidates'][variant]],
        variant_scores=variant_scores,
        rules=dict(
            variant=f"{config.FORECAST_DEFAULT_VARIANT} unless predictor selection inside the cross-validation beats it in both mean RPSS and mean MAE skill over the three macroregions and all leads.",
            skill=f"A unit and lead uses the model only if backtest RPSS >= {config.FORECAST_MIN_RPSS} and MAE skill > {config.FORECAST_MIN_MAE_SKILL}; otherwise climatology.",
            activity=f"Departments with median August-October activity below {config.FORECAST_DEPARTMENT_MIN_SEASON} fire cell-days in {config.HISTORY_YEARS[0]}-{config.HISTORY_YEARS[1]} get no forecast."),
        regions=regions,
        metrics=metrics(regions, backtest, variant),
        backtest=dict(scheme='leave-one-year-out; predictor set, ridge alpha and spread chosen inside each training fold',
                      years=list(config.HISTORY_YEARS), rows=backtest),
        out_of_sample=dict(year=config.FORECAST_OOS_YEAR, rows=oos),
        raw_vs_corrected=demo,
        departments_check=dict(cells=int(len(cells)), cells_reassigned_to_macroregion=int((cells['department'] != cells['unconstrained']).sum()),
                               **check_sums({r: state['fire'][r] for r in config.REGIONS}, state['departments'], state['macro_of'])),
        sources=dict(
            oni=dict(url=config.ONI_URL, last=label(max(state['enso']['oni']))),
            icen=dict(url=config.ICEN_URL, last=label(max(state['enso']['icen']))),
            precipitation='NASA POWER monthly PRECTOTCORR, mean over grid points of each macroregion; departments use their macroregion.'),
        notes=[
            'Probabilities come from a normal distribution in log space centred on the forecast, with the spread of leave-one-year-out residuals of the training years.',
            'ENSO indices enter with the 3-month window ending one month before the origin; precipitation windows end one month before the origin.',
            'Department series sum the estimated cell-days of map.parquet; before 2012 part of each month is spread over cells with the VIIRS 2013-2024 climatology.',
            'Department forecasts are published only where the backtest beats climatology; selecting units by backtest skill favours some lucky units.',
            '2026 August-October observations are near-real-time (provisional).'])
    write_json(OUTPUT_PATH, output)
    if 'forecast' in method:
        published = [dict(region=r['region'], method=r['method'], median=r['median'], low=r['low'], high=r['high'],
                          most_likely_class=r['most_likely_class']) for r in regions if r['level'] != 'department' and r['published']]
        method['forecast']['season_outlook'] = dict(
            file='forecast.json', variant=variant, origin=output['origin'], target_year=output['target_year'],
            lead=output['lead'], published=published, metrics=output['metrics'])
        write_json(METHOD_PATH, method)
    print(json.dumps(dict(variant=variant, variant_scores=variant_scores, metrics=output['metrics'],
                          departments_check=output['departments_check']), indent=1))


if __name__ == '__main__':
    main()
