import json

import config
from build_series import connect, load_table, records


COORD_DIGITS = 2
ESTIMATE_DIGITS = 2
OUTPUT = config.PROCESSED_DIR / 'map.parquet'
SAMPLE_YEAR, SAMPLE_MONTH = 2024, 9
SAMPLE = config.PROCESSED_DIR / f'map-sample-{SAMPLE_YEAR}-{SAMPLE_MONTH:02d}.json'
SAMPLE_FIELDS = ('lat', 'lon', 'raw_modis', 'raw_viirs', 'estimated')
COMPRESSION = 'zstd'


def build(con):
    series = json.loads((config.PROCESSED_DIR / 'series.json').read_text())
    con.execute('CREATE TEMP TABLE series (region VARCHAR, year INTEGER, month INTEGER, estimated DOUBLE, source VARCHAR)')
    con.executemany('INSERT INTO series VALUES (?,?,?,?,?)',
                    [(r['region'], r['year'], r['month'], r['estimated'], r['source'])
                     for r in series if r['region'] in config.REGIONS])
    load_table(con, 'cells')
    con.execute('''
        CREATE TEMP TABLE base AS
        SELECT cell_y, cell_x, any_value(lat) AS lat, any_value(lon) AS lon, region, year, month,
            count(DISTINCT date) FILTER (WHERE sensor IN ('aqua','terra')) AS raw_modis,
            count(DISTINCT date) FILTER (WHERE sensor = 'snpp') AS raw_viirs,
            count(DISTINCT date) AS raw_any
        FROM cells GROUP BY cell_y, cell_x, region, year, month
    ''')
    con.execute('''
        CREATE TEMP TABLE weighted AS
        SELECT b.*, s.estimated AS regional, s.source,
            CASE WHEN s.source = 'modis_only' THEN b.raw_modis ELSE b.raw_viirs END AS ref_weight
        FROM base b JOIN series s USING (region, year, month)
    ''')
    con.execute('''
        CREATE TEMP TABLE totals AS
        SELECT region, year, month, sum(ref_weight) AS ref_total, sum(raw_any) AS any_total
        FROM weighted GROUP BY region, year, month
    ''')
    fallbacks = records(con, 'SELECT region, year, month FROM totals WHERE ref_total = 0 ORDER BY 1,2,3')
    return fallbacks


def main():
    with connect() as con:
        fallbacks = build(con)
        con.execute('''
            CREATE TEMP TABLE final AS
            SELECT round(w.lat, ?) AS lat, round(w.lon, ?) AS lon, w.region,
                w.year::INTEGER AS year, w.month::INTEGER AS month,
                w.raw_modis::INTEGER AS raw_modis,
                CASE WHEN (w.year, w.month) >= (?, ?) THEN w.raw_viirs::INTEGER END AS raw_viirs,
                CASE WHEN t.ref_total > 0 THEN w.regional * w.ref_weight / t.ref_total
                     WHEN w.regional > 0 THEN w.regional * w.raw_any / t.any_total
                     ELSE 0 END AS estimated_raw,
                NULL::DOUBLE AS size_ratio
            FROM weighted w JOIN totals t USING (region, year, month)
        ''', [COORD_DIGITS, COORD_DIGITS, config.VIIRS_START.year, config.VIIRS_START.month])
        con.execute('''
            COPY (SELECT lat, lon, region, year, month, raw_modis, raw_viirs,
                         round(estimated_raw, ?)::DOUBLE AS estimated, size_ratio
                  FROM final ORDER BY year, month, region, lat, lon)
            TO ? (FORMAT PARQUET, COMPRESSION ?)
        ''', [ESTIMATE_DIGITS, str(OUTPUT), COMPRESSION])
        sample = records(con, f'''
            SELECT {', '.join(SAMPLE_FIELDS[:4])}, round(estimated_raw, ?)::DOUBLE AS estimated
            FROM final WHERE year = ? AND month = ? ORDER BY region, lat, lon
        ''', [ESTIMATE_DIGITS, SAMPLE_YEAR, SAMPLE_MONTH])
        SAMPLE.write_text(json.dumps(sample, separators=(',', ':'), allow_nan=False) + '\n')
        total = con.execute('SELECT count(*) FROM read_parquet(?)', [str(OUTPUT)]).fetchone()[0]
        per_year = con.execute('SELECT year, count(*) FROM read_parquet(?) GROUP BY 1 ORDER BY 1', [str(OUTPUT)]).fetchall()
        series = json.loads((config.PROCESSED_DIR / 'series.json').read_text())
        sums = {(r[0], r[1], r[2]): r[3:] for r in con.execute(
            'SELECT region, year, month, sum(estimated_raw), sum(raw_modis), coalesce(sum(raw_viirs), 0) FROM final GROUP BY 1,2,3').fetchall()}
        maxima = [0.0, 0.0, 0.0]
        for r in series:
            if r['region'] not in config.REGIONS:
                continue
            got = sums.get((r['region'], r['year'], r['month']), (0, 0, 0))
            for i, want in enumerate((r['estimated'], r['raw_modis'], r['raw_viirs'] or 0)):
                maxima[i] = max(maxima[i], abs(got[i] - want))
        print(f'Rows: {total}; size: {OUTPUT.stat().st_size} bytes ({OUTPUT.stat().st_size / 1e6:.2f} MB)')
        print('Rows per year: ' + ', '.join(f'{y}: {n}' for y, n in per_year))
        print(f'Max |cells - series|: estimated {maxima[0]:.4f}, raw_modis {maxima[1]:.0f}, raw_viirs {maxima[2]:.0f}')
        print(f'Zero reference weight cases: {len(fallbacks)}')
        for f in fallbacks:
            print(f"  {f['region']} {f['year']}-{f['month']:02d}")


if __name__ == '__main__':
    main()
