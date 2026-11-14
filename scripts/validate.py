import json
from pathlib import Path
import runpy

import numpy as np

import config
from build_series import connect, load_table, records, write_json


EMULATOR_FIELDS = ('train_years', 'test_years', 'auc', 'brier', 'monthly_error_pct',
                   'monthly_error_pct_fixed_ratio', 'by_region')


def correlated_bias():
    test = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'tests' / 'test_capture_recapture.py'))
    properties = {}
    test['test_correlated_detection_underestimates'](lambda name, value: properties.update({name: value}))
    return 100 * properties['correlated_relative_bias']


def periods(con):
    rows = records(con, '''
        SELECT year,month,
            CASE WHEN bool_or(mode IN ('both','snpp')) THEN 'viirs'
                 WHEN bool_or(mode='aqua') THEN 'aqua' ELSE 'terra_bridge' END AS source
        FROM capture_segments GROUP BY year,month ORDER BY year,month
    ''')
    output = []
    previous = None
    for row in rows:
        month = f"{row['year']:04d}-{row['month']:02d}"
        confidence = 'low' if month <= config.LOW_CONFIDENCE_UNTIL.strftime('%Y-%m') else 'normal'
        index = row['year'] * 12 + row['month']
        if output and previous + 1 == index and (output[-1]['source'], output[-1]['confidence']) == (row['source'], confidence):
            output[-1]['to'] = month
        else:
            output.append({'from': month, 'to': month, 'source': row['source'], 'confidence': confidence})
        previous = index
    return output


def annual_report(con):
    return records(con, '''
        WITH draws AS (
            SELECT year,replicate,sum(estimated) AS estimated
            FROM series_replicates WHERE region=? GROUP BY year,replicate
        ), limits AS (
            SELECT year,quantile_cont(estimated, ?) AS lo,quantile_cont(estimated, ?) AS hi
            FROM draws GROUP BY year
        ), points AS (
            SELECT year,sum(estimated) AS estimated,list(DISTINCT source ORDER BY source) AS source
            FROM estimates WHERE region=? GROUP BY year
        ) SELECT year,estimated,least(lo,estimated) AS est_low,greatest(hi,estimated) AS est_high,
            100*(greatest(hi,estimated)-least(lo,estimated))/estimated AS relative_width_pct,source
          FROM points JOIN limits USING(year) ORDER BY year
    ''', [config.NATIONAL, (1-config.CI_LEVEL)/2, (1+config.CI_LEVEL)/2, config.NATIONAL])


def main():
    sensitivity = json.loads((config.INTERIM_DIR / 'sensitivity.json').read_text())
    emulator = json.loads((config.INTERIM_DIR / 'emulator_metrics.json').read_text())
    with connect() as con:
        for name in ('detection_probs', 'capture_segments', 'estimates', 'series_replicates',
                     'modis_equiv_emulated', 'overpass', 'cells'):
            load_table(con, name)
        con.execute('CREATE TEMP TABLE series AS SELECT * FROM read_json_auto(?)', [str(config.PROCESSED_DIR / 'series.json')])
        con.execute('''CREATE TEMP TABLE comparison AS
            SELECT region,year,month,estimated_from_aqua AS predicted,estimated AS actual
            FROM capture_segments WHERE mode='both'
            UNION ALL
            SELECT ?,year,month,sum(estimated_from_aqua),sum(estimated)
            FROM capture_segments WHERE mode='both' GROUP BY year,month
        ''', [config.NATIONAL])
        errors = records(con, '''
            SELECT region,avg(abs(predicted/actual-1))*100 AS error_pct_method
            FROM (SELECT region,year,sum(predicted) AS predicted,sum(actual) AS actual
                  FROM comparison WHERE year BETWEEN ? AND ? GROUP BY region,year)
            WHERE actual>0 GROUP BY region
        ''', list(config.TEST_YEARS))
        naive = dict(con.execute('''
            SELECT region,avg(abs(raw/estimated-1))*100 FROM (
                SELECT region,year,sum(raw_detections) AS raw,sum(e.estimated) AS estimated
                FROM series JOIN estimates e USING(region,year,month)
                WHERE year BETWEEN ? AND ? GROUP BY region,year)
            WHERE estimated>0 GROUP BY region
        ''', list(config.TEST_YEARS)).fetchall())
        correlations = {}
        map_path = config.INTERIM_DIR / 'mapbiomas.parquet'
        if map_path.exists():
            load_table(con, 'mapbiomas')
            columns = {r[0] for r in con.execute('DESCRIBE mapbiomas').fetchall()}
            area = next((name for name in ('burned_area_ha', 'area_ha', 'burned_ha') if name in columns), None)
            if area is None:
                raise ValueError(f'Unrecognized MapBiomas area column: {sorted(columns)}')
            con.execute(f'''CREATE TEMP TABLE burned AS
                SELECT region,year,sum({area}) AS area FROM mapbiomas GROUP BY region,year''')
            if not con.execute('SELECT count(*) FROM burned WHERE region=?', [config.NATIONAL]).fetchone()[0]:
                con.execute('INSERT INTO burned SELECT ?,year,sum(area) FROM burned WHERE region IN (SELECT unnest(?)) GROUP BY year', [config.NATIONAL, list(config.REGIONS)])
            correlations = dict(con.execute('''
                SELECT region,corr(estimated,area) FROM (
                    SELECT region,year,sum(estimated) AS estimated FROM estimates
                    WHERE year BETWEEN ? AND ? GROUP BY region,year)
                JOIN burned USING(region,year) GROUP BY region
            ''', [config.FIRST_YEAR + 1, config.HISTORY_YEARS[1]]).fetchall())
        validation = [dict(region=r, error_pct_method=next(x['error_pct_method'] for x in errors if x['region']==r),
                           error_pct_naive=naive[r], mapbiomas_corr=correlations.get(r))
                      for r in (*config.REGIONS, config.NATIONAL)]
        detection = records(con, '''SELECT region,month,n1 AS n_modis,n2 AS n_viirs,m AS n_both,
            p1 AS p_modis,p2 AS p_viirs FROM detection_probs
            WHERE sensor_pair='aqua_snpp' ORDER BY region,month''')
        last_year = con.execute('SELECT max(year) FROM estimates').fetchone()[0]
        drift = records(con, '''
            SELECT region,avg(abs(modis_equiv_emulated/nullif(n_aqua,0)-1))*100 AS monthly_error_pct,
                abs(sum(modis_equiv_emulated)/nullif(sum(n_aqua),0)-1)*100 AS annual_error_pct,
                (sum(modis_equiv_emulated)/nullif(sum(n_aqua),0)-1)*100 AS signed_annual_error_pct
            FROM modis_equiv_emulated WHERE year=? GROUP BY region ORDER BY region
        ''', [last_year])
        times = records(con, '''SELECT year,median(day_lst_min) AS median_local_solar_minutes
            FROM cells WHERE sensor='aqua' AND has_day AND year BETWEEN ? AND ?
            GROUP BY year ORDER BY year''', [config.CALIBRATION_YEARS[0], last_year])
        findings = {
            'calibration_overpass_gaps': [{k: r[k] for k in ('gap_lower', 'gap_upper', 'coincidence', 'N_over_snpp')}
                for r in sensitivity['overpass_diagnostics'] if r['period']=='calibration' and r['scan_tercile'] is None],
            'chapman_correlated_bias_pct': correlated_bias(),
            'emulator_drift': {'year': last_year, 'by_region': drift},
            'aqua_overpass_by_year': times,
            'definitions': {
                'chapman_bias': 'Synthetic correlated-detection test; not an empirical correction to Peru.',
                'aqua_overpass': 'Median daytime cell-day local solar time; minutes after local midnight.',
                'structural_error': 'Uncentered exp(log(predicted/reference)) residuals, sampled in whole year blocks shared across all regions and months. Aqua: test years; Terra: backcast years. Applied to pre-VIIRS years only, including mixed Terra/Aqua months. Zero predictions retain the limiting factor zero; no pseudocount. Interval endpoints include the unchanged point estimate.',
                'annual_range': 'Quantiles after summing aligned monthly and regional replicates; never a sum of interval endpoints.',
                'validation': 'Aqua/VIIRS comparison uses identical jointly available days. Naive error compares raw detections with cell-day estimates and is not a same-unit accuracy metric.',
                'periods': 'Monthly dominant reference; July of the Aqua start year includes a short Terra bridge. Availability substitutions remain in capture_segments.parquet.',
                'mapbiomas': 'Annual Pearson correlation on shared years, excluding the incomplete first year; burned area and active fire cell-days are different quantities.'
            }
        }
        result = dict(params=dict(grid_deg=config.GRID_DEG, calibration_years=config.CALIBRATION_YEARS,
            test_years=config.TEST_YEARS, simultaneous_max_minutes=config.SIMULTANEOUS_MAX_MINUTES,
            ci_level=config.CI_LEVEL), detection=detection, validation=validation,
            emulator={k: emulator[k] for k in EMULATOR_FIELDS}, periods=periods(con), findings=findings)
        write_json(config.PROCESSED_DIR / 'methodology.json', result)
        annual = annual_report(con)
        widths = {name: float(np.mean([r['relative_width_pct'] for r in annual if start <= r['year'] <= end]))
                  for name, start, end in [('terra', config.FIRST_YEAR, config.AQUA_START.year),
                    ('aqua', config.HISTORY_YEARS[0], config.VIIRS_START.year-1),
                    ('viirs', config.CALIBRATION_YEARS[0], config.DRIFT_START_YEAR-1)]}
        print(json.dumps(dict(national_annual=annual, validation=validation, emulator=result['emulator'],
            findings=findings, periods=result['periods'], mean_annual_relative_width_pct=widths,
            width_order_passed=widths['terra']>widths['aqua']>widths['viirs'],
            acceptance=sensitivity['acceptance'],
            annual_sensor_ratios=[{k:r[k] for k in ('year','estimated_over_snpp','estimated_over_aqua')}
                                 for r in sensitivity['national_annual']],
            json_bytes={p.name:p.stat().st_size for p in (config.PROCESSED_DIR/'series.json',config.PROCESSED_DIR/'methodology.json')}), indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
