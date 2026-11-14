import json

import numpy as np
from scipy.stats import spearmanr

import config
from build_series import connect, load_table, records, write_json


COORD_DIGITS = 2
ESTIMATE_DIGITS = 2
OUTPUT = config.PROCESSED_DIR / 'map.parquet'
SAMPLE_YEAR, SAMPLE_MONTH = 2024, 9
SAMPLE = config.PROCESSED_DIR / f'map-sample-{SAMPLE_YEAR}-{SAMPLE_MONTH:02d}.json'
COLUMNS = ('lat', 'lon', 'region', 'year', 'month', 'raw_terra', 'raw_aqua', 'raw_modis',
           'raw_viirs', 'estimated', 'size_ratio')
SAMPLE_FIELDS = ('lat', 'lon', 'raw_terra', 'raw_aqua', 'raw_modis', 'raw_viirs', 'estimated')
COMPRESSION = 'zstd'
CLIMATOLOGY_YEARS = (config.CALIBRATION_YEARS[0], config.TEST_YEARS[1])
VALIDATION_YEARS = config.CALIBRATION_YEARS
VALIDATION_SEEN_SENSOR = 'aqua'
VALIDATION_MIN_CELLS = 10
MAX_CELL_DAYS = 31
VALIDATION_OUTPUT = config.INTERIM_DIR / 'map_validation.json'
QUANTILES = (25, 50, 75)


def build(con):
    series = json.loads((config.PROCESSED_DIR / 'series.json').read_text())
    con.execute('CREATE TEMP TABLE series (region VARCHAR, year INTEGER, month INTEGER, estimated DOUBLE, source VARCHAR)')
    con.executemany('INSERT INTO series VALUES (?,?,?,?,?)',
                    [(r['region'], r['year'], r['month'], r['estimated'], r['source'])
                     for r in series if r['region'] in config.REGIONS and not r['is_forecast']])
    load_table(con, 'cells')
    con.execute('''
        CREATE TEMP TABLE base AS
        SELECT cell_y, cell_x, any_value(lat) AS lat, any_value(lon) AS lon, region, year, month,
            count(DISTINCT date) FILTER (WHERE sensor = 'terra') AS raw_terra,
            count(DISTINCT date) FILTER (WHERE sensor = 'aqua') AS raw_aqua,
            count(DISTINCT date) FILTER (WHERE sensor IN ('aqua','terra')) AS raw_modis,
            count(DISTINCT date) FILTER (WHERE sensor = 'snpp') AS raw_viirs,
            count(DISTINCT date) FILTER (WHERE sensor = 'snpp' OR (sensor = 'noaa20' AND date > ?)) AS raw_viirs_reference,
            count(DISTINCT date) FILTER (WHERE sensor = ?) AS raw_seen_validation,
            count(DISTINCT date) FILTER (WHERE sensor IN ('aqua','terra','snpp') OR (sensor = 'noaa20' AND date > ?)) AS raw_any
        FROM cells GROUP BY cell_y, cell_x, region, year, month
    ''', [config.SNPP_END, VALIDATION_SEEN_SENSOR, config.SNPP_END])
    con.execute('''
        CREATE TEMP TABLE weighted AS
        SELECT b.*, s.estimated AS regional, s.source,
            CASE WHEN s.source = 'modis_only' THEN b.raw_modis ELSE b.raw_viirs_reference END AS ref_weight
        FROM base b JOIN series s USING (region, year, month)
    ''')
    con.execute('''
        CREATE TEMP TABLE totals AS
        SELECT region, year, month, sum(ref_weight) AS ref_total, sum(raw_any) AS any_total
        FROM weighted GROUP BY region, year, month
    ''')
    con.execute('''
        CREATE TEMP TABLE snpp_counts AS
        SELECT region, cell_y, cell_x, any_value(lat) AS lat, any_value(lon) AS lon, year, month,
            count(DISTINCT date) AS n
        FROM cells WHERE sensor = 'snpp' AND year BETWEEN ? AND ?
        GROUP BY region, cell_y, cell_x, year, month
    ''', list(CLIMATOLOGY_YEARS))
    con.execute('''
        CREATE TEMP TABLE clim AS
        SELECT region, cell_y, cell_x, any_value(lat) AS lat, any_value(lon) AS lon, month,
            sum(n) / sum(sum(n)) OVER (PARTITION BY region, month) AS share
        FROM snpp_counts GROUP BY region, cell_y, cell_x, month
    ''')
    return records(con, 'SELECT region, year, month FROM totals WHERE ref_total = 0 ORDER BY 1,2,3')


def quantiles(values):
    if not values:
        return None
    return dict(zip(('p25', 'median', 'p75'), (round(float(v), 4) for v in np.percentile(values, QUANTILES))))


def above_pct(arrays):
    values = np.concatenate(arrays) if arrays else np.array([])
    positive = values[values > 0]
    above = int((positive > MAX_CELL_DAYS).sum())
    return {'cells': int(positive.size), 'above': above,
            'pct_above': round(100 * above / positive.size, 4) if positive.size else None,
            'max': round(float(positive.max()), 2) if positive.size else None}


def validate(con):
    con.execute('''
        CREATE TEMP TABLE val_months AS
        SELECT region, year, month, estimated AS regional FROM series
        WHERE source = 'both' AND year BETWEEN ? AND ?
    ''', list(VALIDATION_YEARS))
    frame = con.execute('''
        WITH loo AS (
            SELECT c.region, c.cell_y, c.cell_x, t.year, c.month, sum(c.n) AS n_clim
            FROM snpp_counts c JOIN val_months t
                ON c.region = t.region AND c.month = t.month AND c.year <> t.year
            GROUP BY ALL
        ), observed AS (
            SELECT b.region, b.cell_y, b.cell_x, b.year, b.month, b.raw_viirs, b.raw_seen_validation
            FROM base b JOIN val_months t USING (region, year, month)
        )
        SELECT region, year, month, t.regional,
            coalesce(o.raw_viirs, 0) AS viirs, coalesce(o.raw_seen_validation, 0) AS seen,
            coalesce(l.n_clim, 0) AS clim
        FROM observed o FULL JOIN loo l USING (region, cell_y, cell_x, year, month)
        JOIN val_months t USING (region, year, month)
        ORDER BY region, year, month
    ''').df()
    rhos = {region: {'current': [], 'new': []} for region in config.REGIONS}
    cells = {'truth': [], 'current': [], 'new': []}
    skipped = {'no_truth': 0, 'no_seen': 0, 'too_few_cells': 0, 'constant': 0}
    unseen_negative = 0
    for (region, year, month), g in frame.groupby(['region', 'year', 'month'], sort=True):
        regional = g['regional'].iloc[0]
        viirs, seen, clim = (g[c].to_numpy(dtype=float) for c in ('viirs', 'seen', 'clim'))
        if viirs.sum() == 0 or regional <= 0:
            skipped['no_truth'] += 1
            continue
        if seen.sum() == 0:
            skipped['no_seen'] += 1
            continue
        truth = regional * viirs / viirs.sum()
        current = regional * seen / seen.sum()
        unseen = regional - seen.sum()
        if unseen < 0 or clim.sum() == 0:
            unseen_negative += unseen < 0
            new = current
        else:
            new = seen + unseen * clim / clim.sum()
        for name, values in (('truth', truth), ('current', current), ('new', new)):
            cells[name].append(values)
        if len(g) < VALIDATION_MIN_CELLS:
            skipped['too_few_cells'] += 1
            continue
        if np.ptp(current) == 0 or np.ptp(new) == 0:
            skipped['constant'] += 1
            continue
        rhos[region]['current'].append(spearmanr(truth, current).statistic)
        rhos[region]['new'].append(spearmanr(truth, new).statistic)
    by_region = {
        region: {'months': len(r['current']), 'spearman_current': quantiles(r['current']),
                 'spearman_new': quantiles(r['new']),
                 'new_better_share': round(float(np.mean(np.array(r['new']) > np.array(r['current']))), 4)
                 if r['current'] else None}
        for region, r in rhos.items()
    }
    all_current = [v for r in rhos.values() for v in r['current']]
    all_new = [v for r in rhos.values() for v in r['new']]
    apply_new = all(
        by_region[region]['months'] and by_region[region]['spearman_new']['median']
        > by_region[region]['spearman_current']['median'] for region in config.REGIONS)
    result = {
        'years': list(VALIDATION_YEARS), 'climatology_years': list(CLIMATOLOGY_YEARS),
        'climatology': 'leave-one-year-out (target year excluded)',
        'seen_sensor': VALIDATION_SEEN_SENSOR, 'truth': 'regional estimated split by S-NPP cell-days',
        'universe': 'cells with any sensor or climatology > 0 in the region and month',
        'min_cells': VALIDATION_MIN_CELLS, 'max_cell_days': MAX_CELL_DAYS,
        'by_region': by_region,
        'all': {'months': len(all_current), 'spearman_current': quantiles(all_current),
                'spearman_new': quantiles(all_new)},
        'cells_above_max': {name: above_pct(values) for name, values in cells.items()},
        'skipped_months': skipped, 'unseen_negative_months': int(unseen_negative),
        'decision_rule': 'apply if the median Spearman of the new rule beats the current rule in every region',
        'applied': bool(apply_new),
    }
    write_json(VALIDATION_OUTPUT, result)
    return result


def main():
    with connect() as con:
        fallbacks = build(con)
        validation = validate(con)
        con.execute('''
            CREATE TEMP TABLE modis_months AS
            SELECT s.region, s.year, s.month, s.estimated - coalesce(t.seen, 0) AS unseen,
                EXISTS (SELECT 1 FROM clim c WHERE c.region = s.region AND c.month = s.month) AS has_clim
            FROM series s
            LEFT JOIN (SELECT region, year, month, sum(raw_modis) AS seen FROM base GROUP BY ALL) t
                USING (region, year, month)
            WHERE s.source = 'modis_only'
        ''')
        con.execute('''
            CREATE TEMP TABLE rule_months AS
            SELECT region, year, month, unseen FROM modis_months WHERE ? AND unseen >= 0 AND has_clim
        ''', [validation['applied']])
        con.execute('''
            CREATE TEMP TABLE keys AS
            SELECT region, year, month, cell_y, cell_x, lat, lon FROM weighted
            UNION
            SELECT r.region, r.year, r.month, c.cell_y, c.cell_x, c.lat, c.lon
            FROM rule_months r JOIN clim c USING (region, month)
        ''')
        con.execute('''
            CREATE TEMP TABLE final AS
            SELECT round(k.lat, ?) AS lat, round(k.lon, ?) AS lon, k.region,
                k.year::INTEGER AS year, k.month::INTEGER AS month,
                coalesce(w.raw_terra, 0)::INTEGER AS raw_terra,
                coalesce(w.raw_aqua, 0)::INTEGER AS raw_aqua,
                coalesce(w.raw_modis, 0)::INTEGER AS raw_modis,
                CASE WHEN (k.year, k.month) >= (?, ?) THEN coalesce(w.raw_viirs, 0)::INTEGER END AS raw_viirs,
                CASE WHEN r.region IS NOT NULL THEN coalesce(w.raw_modis, 0) + r.unseen * coalesce(c.share, 0)
                     WHEN t.ref_total > 0 THEN coalesce(w.regional * w.ref_weight / t.ref_total, 0)
                     WHEN w.regional > 0 THEN w.regional * w.raw_any / t.any_total
                     ELSE 0 END AS estimated_raw,
                NULL::DOUBLE AS size_ratio
            FROM keys k
            LEFT JOIN weighted w USING (region, year, month, cell_y, cell_x)
            LEFT JOIN totals t USING (region, year, month)
            LEFT JOIN rule_months r USING (region, year, month)
            LEFT JOIN clim c USING (region, month, cell_y, cell_x)
        ''', [COORD_DIGITS, COORD_DIGITS, config.VIIRS_START.year, config.VIIRS_START.month])
        scale = 10 ** ESTIMATE_DIGITS
        con.execute(f'''
            COPY (
                WITH floored AS (
                    SELECT *, floor(estimated_raw * {scale}) AS units,
                        estimated_raw * {scale} - floor(estimated_raw * {scale}) AS remainder
                    FROM final
                ), ranked AS (
                    SELECT *, round(sum(estimated_raw) OVER g * {scale}) - sum(units) OVER g AS deficit,
                        row_number() OVER (PARTITION BY region, year, month ORDER BY remainder DESC, lat, lon) AS rank
                    FROM floored WINDOW g AS (PARTITION BY region, year, month)
                ), rounded AS (
                    SELECT *, ((units + (rank <= deficit)::INTEGER) / {scale})::DOUBLE AS estimated FROM ranked
                )
                SELECT {', '.join(COLUMNS)} FROM rounded
                WHERE raw_modis > 0 OR coalesce(raw_viirs, 0) > 0 OR estimated > 0
                ORDER BY year, month, region, lat, lon)
            TO ? (FORMAT PARQUET, COMPRESSION ?)
        ''', [str(OUTPUT), COMPRESSION])
        sample = records(con, f'''
            SELECT {', '.join(SAMPLE_FIELDS)} FROM read_parquet(?)
            WHERE year = ? AND month = ? ORDER BY lat, lon
        ''', [str(OUTPUT), SAMPLE_YEAR, SAMPLE_MONTH])
        SAMPLE.write_text(json.dumps(sample, separators=(',', ':'), allow_nan=False) + '\n')
        total = con.execute('SELECT count(*) FROM read_parquet(?)', [str(OUTPUT)]).fetchone()[0]
        per_year = con.execute('SELECT year, count(*) FROM read_parquet(?) GROUP BY 1 ORDER BY 1', [str(OUTPUT)]).fetchall()
        series = json.loads((config.PROCESSED_DIR / 'series.json').read_text())
        sums = {(r[0], r[1], r[2]): r[3:] for r in con.execute(
            'SELECT region, year, month, sum(estimated), sum(raw_modis), coalesce(sum(raw_viirs), 0) '
            'FROM read_parquet(?) GROUP BY 1,2,3', [str(OUTPUT)]).fetchall()}
        maxima = [0.0, 0.0, 0.0]
        for r in series:
            if r['region'] not in config.REGIONS or r['is_forecast']:
                continue
            got = sums.get((r['region'], r['year'], r['month']), (0, 0, 0))
            for i, want in enumerate((r['estimated'], r['raw_modis'], r['raw_viirs'] or 0)):
                maxima[i] = max(maxima[i], abs(got[i] - want))
        above = con.execute('''
            SELECT count(*) FILTER (WHERE estimated > ?), count(*) FILTER (WHERE estimated > ? AND year < ?),
                count(*) FILTER (WHERE year < ?), max(estimated) FILTER (WHERE year < ?)
            FROM read_parquet(?)
        ''', [MAX_CELL_DAYS, MAX_CELL_DAYS, config.VIIRS_START.year, config.VIIRS_START.year,
              config.VIIRS_START.year, str(OUTPUT)]).fetchone()
        negative = records(con, 'SELECT region, year, month, unseen FROM modis_months WHERE unseen < 0 ORDER BY 1,2,3')
        no_clim = records(con, 'SELECT region, year, month FROM modis_months WHERE NOT has_clim ORDER BY 1,2,3')
        for name in ('all', *config.REGIONS):
            v = validation['all'] if name == 'all' else validation['by_region'][name]
            print(f"Validation {name}: months {v['months']}, Spearman current {v['spearman_current']}, "
                  f"new {v['spearman_new']}")
        for name, v in validation['cells_above_max'].items():
            print(f"Validation cells > {MAX_CELL_DAYS} ({name}): {v['above']}/{v['cells']} ({v['pct_above']}%), max {v['max']}")
        print(f"New rule applied: {validation['applied']}")
        print(f'Rows: {total}; size: {OUTPUT.stat().st_size} bytes ({OUTPUT.stat().st_size / 1e6:.2f} MB)')
        print('Rows per year: ' + ', '.join(f'{y}: {n}' for y, n in per_year))
        print(f'Max |cells - series|: estimated {maxima[0]:.4f}, raw_modis {maxima[1]:.0f}, raw_viirs {maxima[2]:.0f}')
        print(f'Cells > {MAX_CELL_DAYS}: {above[0]}/{total} ({100 * above[0] / total:.4f}%); '
              f'before {config.VIIRS_START.year}: {above[1]}/{above[2]} ({100 * above[1] / above[2]:.4f}%), max {above[3]}')
        print(f'Months with unseen < 0 (current rule kept): {len(negative)}')
        for f in negative:
            print(f"  {f['region']} {f['year']}-{f['month']:02d} unseen {f['unseen']:.1f}")
        print(f'Months without VIIRS climatology (current rule kept): {len(no_clim)}')
        print(f'Zero reference weight cases: {len(fallbacks)}')
        for f in fallbacks:
            print(f"  {f['region']} {f['year']}-{f['month']:02d}")


if __name__ == '__main__':
    main()
