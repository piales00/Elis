import json

import duckdb
import numpy as np
import pyarrow as pa

import config


ROUND_DIGITS = 1
SERIES_FIELDS = ('region', 'year', 'month', 'raw_modis', 'raw_viirs', 'raw_detections',
                 'estimated', 'est_low', 'est_high', 'modis_equiv', 'source',
                 'hist_median', 'anomaly_class', 'is_forecast')


def connect():
    return duckdb.connect(config={'threads': config.N_JOBS,
        'autoinstall_known_extensions': 'false', 'autoload_known_extensions': 'false'})


def records(con, query, parameters=None):
    result = con.execute(query, parameters or [])
    names = [column[0] for column in result.description]
    return [dict(zip(names, row)) for row in result.fetchall()]


def load_table(con, name):
    con.execute(f'CREATE TEMP TABLE {name} AS SELECT * FROM read_parquet(?)',
                [str(config.INTERIM_DIR / f'{name}.parquet')])


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n')


def residual_factors(sensitivity, sensor):
    source = config.STRUCTURAL_ERROR_SOURCE[sensor]
    if source == 'terra_backcast':
        rows = sensitivity['terra_backcast']
    elif source == 'aqua_vs_viirs_test':
        rows = [r for r in sensitivity['test_diagnostics']
                if (r['start_year'], r['end_year']) == config.TEST_YEARS]
    else:
        raise ValueError(f'Unknown structural error source: {source}')
    factors = {}
    for region in rows:
        for row in region['monthly']:
            if row['actual'] <= 0 or row['predicted'] < 0:
                raise ValueError('Structural residual requires a positive reference and nonnegative prediction.')
            factors[(region['region'], row['year'], row['month'])] = row['predicted'] / row['actual']
    years = sorted({y for _, y, _ in factors})
    if any((r, y, m) not in factors for r in config.REGIONS for y in years for m in range(1, 13)):
        raise ValueError('Structural residual year blocks are incomplete.')
    return factors, years


def partial_history(con):
    path = config.INTERIM_DIR / 'partial_window_estimates.parquet'
    if not path.exists():
        return {}
    rows = records(con, 'SELECT * FROM read_parquet(?)', [str(path)])
    last = max(r['year'] for r in rows)
    history = {}
    for row in rows:
        if config.HISTORY_YEARS[0] <= row['year'] <= config.HISTORY_YEARS[1]:
            history.setdefault((row['region'], last, row['month']), []).append(row['estimated'])
    return history


def build_replicates(con, sensitivity):
    rng = np.random.default_rng(config.SEED)
    factors = {sensor: residual_factors(sensitivity, sensor) for sensor in ('aqua', 'terra')}
    draws = {}
    for row in records(con, 'SELECT * FROM estimate_replicates WHERE region <> ? ORDER BY region,year,month,replicate', [config.NATIONAL]):
        key = (row['region'], row['year'], row['month'])
        draws.setdefault(key, np.zeros(config.BOOTSTRAP_N))[row['replicate']] = row['estimated']
    probabilities = {}
    for row in records(con, 'SELECT * FROM detection_probability_replicates ORDER BY replicate'):
        probabilities.setdefault((row['region'], row['month']), np.zeros(config.BOOTSTRAP_N))[row['replicate']] = row['p1']
    bridges = {}
    for row in records(con, 'SELECT * FROM terra_bridge_replicates ORDER BY replicate'):
        bridges.setdefault((row['region'], row['month']), np.zeros(config.BOOTSTRAP_N))[row['replicate']] = row['ratio']
    selected = {}
    for year in sorted({y for _, y, _ in draws if y < config.VIIRS_START.year}):
        for sensor, (_, years) in factors.items():
            selected[(year, sensor)] = rng.choice(years, size=config.BOOTSTRAP_N)
    for row in records(con, "SELECT * FROM capture_segments WHERE year < ? AND mode IN ('aqua','terra') ORDER BY year,month,region,mode", [config.VIIRS_START.year]):
        region, year, month, sensor = (row[k] for k in ('region', 'year', 'month', 'mode'))
        baseline = row['n1'] / probabilities[(region, month)] if sensor == 'aqua' else row['n_terra'] * bridges[(region, month)] / probabilities[(region, month)]
        factor = np.array([factors[sensor][0][(region, int(y), month)] for y in selected[(year, sensor)]])
        draws[(region, year, month)] += baseline * (factor - 1)
    for year, month in sorted({(y, m) for _, y, m in draws}):
        draws[(config.NATIONAL, year, month)] = np.sum([draws[(r, year, month)] for r in config.REGIONS], axis=0)
    output = [dict(region=r, year=y, month=m, replicate=i, estimated=float(value))
              for (r, y, m), values in sorted(draws.items()) for i, value in enumerate(values)]
    con.register('final_replicates', pa.Table.from_pylist(output))
    con.execute('COPY final_replicates TO ? (FORMAT PARQUET)', [str(config.INTERIM_DIR / 'series_replicates.parquet')])
    return draws


def main():
    sensitivity = json.loads((config.INTERIM_DIR / 'sensitivity.json').read_text())
    with connect() as con:
        for name in ('estimates', 'estimate_replicates', 'detection_probability_replicates',
                     'terra_bridge_replicates', 'terra_bridge', 'capture_segments', 'cells',
                     'detections_monthly', 'modis_equiv_emulated'):
            load_table(con, name)
        draws = build_replicates(con, sensitivity)
        raw = records(con, '''
            WITH counts AS (
                SELECT region,year,month,
                    count(DISTINCT (cell_y,cell_x,date)) FILTER(WHERE sensor IN ('aqua','terra')) AS raw_modis,
                    count(*) FILTER(WHERE sensor='snpp') AS raw_viirs,
                    count(*) FILTER(WHERE sensor='aqua') AS aqua,
                    count(*) FILTER(WHERE sensor='terra') AS terra
                FROM cells GROUP BY region,year,month
            ), detections AS (
                SELECT region,year,month,sum(n_detections)::BIGINT AS raw_detections
                FROM detections_monthly GROUP BY region,year,month
            ) SELECT * FROM counts JOIN detections USING(region,year,month)
        ''')
        raw_index = {(r['region'], r['year'], r['month']): r for r in raw}
        bridge = {(r['region'], r['month']): r['ratio'] for r in records(con, 'SELECT * FROM terra_bridge')}
        emulated = {(r['region'], r['year'], r['month']): r['modis_equiv_emulated'] for r in records(con, 'SELECT * FROM modis_equiv_emulated')}
        aqua_end = con.execute("SELECT max(date) FROM cells WHERE sensor='aqua'").fetchone()[0]
        monthly_equiv = {}
        for key, row in raw_index.items():
            region, year, month = key
            if (year, month) < (config.AQUA_START.year, config.AQUA_START.month):
                value = row['terra'] * bridge[(region, month)]
            elif (year, month) <= (aqua_end.year, aqua_end.month):
                value = row['aqua']
            else:
                value = emulated[key]
            monthly_equiv[key] = value
        for year, month in sorted({(y, m) for _, y, m in raw_index}):
            rows = [raw_index.get((r, year, month), {}) for r in config.REGIONS]
            key = (config.NATIONAL, year, month)
            raw_index[key] = {field: sum(r.get(field, 0) for r in rows)
                              for field in ('raw_modis', 'raw_viirs', 'raw_detections')}
            monthly_equiv[key] = sum(monthly_equiv.get((r, year, month), 0) for r in config.REGIONS)
        estimates = records(con, 'SELECT * FROM estimates ORDER BY region,year,month')
        history = {}
        for row in estimates:
            if config.HISTORY_YEARS[0] <= row['year'] <= config.HISTORY_YEARS[1]:
                history.setdefault((row['region'], row['month']), []).append(row['estimated'])
        partial = partial_history(con)
        output = []
        tails = ((1 - config.CI_LEVEL) / 2, (1 + config.CI_LEVEL) / 2)
        for row in estimates:
            region, year, month = (row[k] for k in ('region', 'year', 'month'))
            key = (region, year, month)
            counts = raw_index.get(key, dict(raw_modis=0, raw_viirs=0, raw_detections=0))
            lo, hi = np.quantile(draws[key], tails)
            baseline = partial.get((region, year, month), history[(region, month)])
            thresholds = np.percentile(baseline, config.ANOMALY_PERCENTILES)
            category = ('low' if row['estimated'] < thresholds[0] else
                        'normal' if row['estimated'] <= thresholds[1] else
                        'high' if row['estimated'] <= thresholds[2] else 'very_high')
            values = (region, year, month, int(counts['raw_modis']),
                      int(counts['raw_viirs']) if (year, month) >= (config.VIIRS_START.year, config.VIIRS_START.month) else None,
                      int(counts['raw_detections']), round(row['estimated'], ROUND_DIGITS),
                      round(min(float(lo), row['estimated']), ROUND_DIGITS),
                      round(max(float(hi), row['estimated']), ROUND_DIGITS),
                      round(monthly_equiv.get(key, 0), ROUND_DIGITS), row['source'],
                      round(float(np.median(baseline)), ROUND_DIGITS), category, False)
            output.append(dict(zip(SERIES_FIELDS, values)))
        write_json(config.PROCESSED_DIR / 'series.json', output)
        print(f'Series: {len(output)} rows; {len(draws) * config.BOOTSTRAP_N} aligned replicates.')


if __name__ == '__main__':
    main()
