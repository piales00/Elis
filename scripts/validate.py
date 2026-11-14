import json
from pathlib import Path
import runpy

import numpy as np

import config
from build_series import connect, load_table, records, write_json
from build_peru_data import slug


EMULATOR_FIELDS = ('train_years', 'test_years', 'auc', 'brier', 'monthly_error_pct',
                   'monthly_error_pct_fixed_ratio', 'by_region')


def correlated_bias():
    test = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'tests' / 'test_capture_recapture.py'))
    properties = {}
    test['test_correlated_detection_underestimates'](lambda name, value: properties.update({name: value}))
    return 100 * properties['correlated_relative_bias']


def periods(con, partial_through):
    rows = records(con, '''
        SELECT year,month,
            CASE WHEN bool_or(mode IN ('both','snpp','noaa20')) THEN 'viirs'
                 WHEN bool_or(mode='aqua') THEN 'aqua' ELSE 'terra_bridge' END AS source,
            bool_or(mode='noaa20') AS noaa20
        FROM capture_segments GROUP BY year,month ORDER BY year,month
    ''')
    first_nrt = con.execute("SELECT min(date) FROM cells WHERE processing='nrt' AND sensor IN ('aqua','terra','snpp','noaa20')").fetchone()[0]
    provisional_from = first_nrt.strftime('%Y-%m') if first_nrt else None
    partial_month = partial_through[:7] if partial_through else None
    output = []
    previous = None
    for row in rows:
        month = f"{row['year']:04d}-{row['month']:02d}"
        confidence = ('low' if month <= config.LOW_CONFIDENCE_UNTIL.strftime('%Y-%m') else
                      'provisional' if provisional_from and month >= provisional_from else 'normal')
        extra = {}
        if month == partial_month:
            extra['partial_through'] = partial_through
            extra['note'] = (f'Partial month: data through {partial_through}. '
                             + ('S-NPP ends on ' + config.SNPP_END.isoformat() + '; later days use NOAA-20 scaled to S-NPP. ' if row['noaa20'] else '')
                             + 'Not extrapolated to the full month; hist_median and anomaly_class compare the same day window in 2003-2025.')
        elif confidence == 'provisional':
            extra['note'] = 'Near-real-time (NRT) detections without the type field; static sources removed with a mask built from standard data.'
        index = row['year'] * 12 + row['month']
        last = output[-1] if output else None
        if last and previous + 1 == index and (last['source'], last['confidence'], last.get('note'), last.get('partial_through')) == (row['source'], confidence, extra.get('note'), extra.get('partial_through')):
            last['to'] = month
        else:
            output.append({'from': month, 'to': month, 'source': row['source'], 'confidence': confidence, **extra})
        previous = index
    return output


def national_detection(con):
    return records(con, '''SELECT ? AS region,month,sum(n1)::BIGINT AS n_modis,sum(n2)::BIGINT AS n_viirs,
        sum(m)::BIGINT AS n_both,sum(n1)/sum(N) AS p_modis,sum(n2)/sum(N) AS p_viirs
        FROM detection_probs WHERE sensor_pair='aqua_snpp' GROUP BY month ORDER BY month''', [config.NATIONAL])


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
            departments = [(slug(name), region) for region, names in config.MACROREGION_DEPARTMENTS.items() for name in names]
            con.execute('CREATE TEMP TABLE department_regions (department VARCHAR, region VARCHAR)')
            con.executemany('INSERT INTO department_regions VALUES (?,?)', departments)
            con.create_function('slug', slug, ['VARCHAR'], 'VARCHAR')
            unmatched = con.execute('''SELECT DISTINCT territory_name FROM mapbiomas WHERE level='department'
                AND slug(territory_name) NOT IN (SELECT department FROM department_regions)''').fetchall()
            if unmatched:
                raise ValueError(f'MapBiomas departments without macroregion: {unmatched}')
            con.execute(f'''CREATE TEMP TABLE burned AS
                SELECT d.region,m.year,sum(m.{area}) AS area FROM mapbiomas m
                JOIN department_regions d ON d.department = slug(m.territory_name)
                WHERE m.level='department' AND m.month IS NULL GROUP BY d.region,m.year
                UNION ALL
                SELECT ?,year,sum({area}) FROM mapbiomas WHERE level='country' AND month IS NULL GROUP BY year''', [config.NATIONAL])
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
            WHERE sensor_pair='aqua_snpp' ORDER BY region,month''') + national_detection(con)
        last_year = con.execute('SELECT max(year) FROM estimates').fetchone()[0]
        drift_year = min(last_year, config.HISTORY_YEARS[1])
        comparable_months = list(range(1, config.SNPP_END.month))
        drift_query = '''
            SELECT region,avg(abs(modis_equiv_emulated/nullif(n_aqua,0)-1))*100 AS monthly_error_pct,
                abs(sum(modis_equiv_emulated)/nullif(sum(n_aqua),0)-1)*100 AS annual_error_pct,
                (sum(modis_equiv_emulated)/nullif(sum(n_aqua),0)-1)*100 AS signed_annual_error_pct,
                sum(modis_equiv_emulated) AS emulated, sum(n_aqua)::BIGINT AS aqua
            FROM modis_equiv_emulated WHERE year=? AND month IN (SELECT unnest(?)) GROUP BY region ORDER BY region
        '''
        drift = [{k: r[k] for k in ('region', 'monthly_error_pct', 'annual_error_pct', 'signed_annual_error_pct')}
                 for r in records(con, drift_query, [drift_year, list(range(1, 13))])]
        latest_drift = records(con, drift_query, [last_year, comparable_months]) if last_year > drift_year else []
        mask = json.loads((config.INTERIM_DIR / 'static_mask_validation.json').read_text())
        times = records(con, '''SELECT year,median(day_lst_min) AS median_local_solar_minutes
            FROM cells WHERE sensor='aqua' AND has_day AND year BETWEEN ? AND ?
            GROUP BY year ORDER BY year''', [config.CALIBRATION_YEARS[0], last_year])
        findings = {
            'calibration_overpass_gaps': [{k: r[k] for k in ('gap_lower', 'gap_upper', 'coincidence', 'N_over_snpp')}
                for r in sensitivity['overpass_diagnostics'] if r['period']=='calibration' and r['scan_tercile'] is None],
            'chapman_correlated_bias_pct': correlated_bias(),
            'emulator_drift': {'year': drift_year, 'by_region': drift},
            'emulator_drift_latest': {'year': last_year, 'months': [comparable_months[0], comparable_months[-1]],
                                      'by_region': latest_drift} if latest_drift else None,
            'static_source_mask': {k: mask[k] for k in ('mask_years', 'min_share', 'min_detections', 'cells', 'validation', 'nrt_removed')},
            'noaa20_ratio': {'included': sensitivity['noaa20_included'], 'max_cv': sensitivity['noaa20_ratio_max_cv'],
                             'by_region': [{k: r[k] for k in ('region', 'year', 'months', 'n_snpp', 'n_noaa20', 'ratio', 'ratio_low', 'ratio_high', 'cv')}
                                           for r in sensitivity['noaa20_ratio']]},
            'aqua_overpass_by_year': times,
            'definitions': {
                'chapman_bias': 'Synthetic correlated-detection test; not an empirical correction to Peru.',
                'aqua_overpass': 'Median daytime cell-day local solar time; minutes after local midnight.',
                'structural_error': 'Uncentered exp(log(predicted/reference)) residuals, sampled in whole year blocks shared across all regions and months. Aqua: test years; Terra: backcast years. Applied to pre-VIIRS years only, including mixed Terra/Aqua months. Zero predictions retain the limiting factor zero; no pseudocount. Interval endpoints include the unchanged point estimate.',
                'annual_range': 'Quantiles after summing aligned monthly and regional replicates; never a sum of interval endpoints.',
                'validation': 'Aqua/VIIRS comparison uses identical jointly available days. Naive error compares raw detections with cell-day estimates and is not a same-unit accuracy metric.',
                'periods': 'Monthly dominant reference; July of the Aqua start year includes a short Terra bridge. Availability substitutions remain in capture_segments.parquet.',
                'mapbiomas': 'Annual Pearson correlation on shared years, excluding the incomplete first year; burned area and active fire cell-days are different quantities. Macroregions sum MapBiomas annual department totals with the same department grouping; Peru uses the country total.',
                'national_detection': 'Peru rows sum regional calibration counts; p = summed counts / summed regional Chapman totals.',
                'emulator_drift_latest': 'Same comparison for the last year, restricted to months fully observed by S-NPP and to jointly available days.',
                'static_source_mask': 'Validation counts are standard-processing detections passing the confidence filter; mask_years overlap the first validation period (in-sample).',
                'noaa20_ratio': 'S-NPP/NOAA-20 cell-day ratio by region on S-NPP-available days; range from a month bootstrap; cv is the coefficient of variation of monthly ratios.',
                'provisional': 'NRT data are replaced by standard data in later FIRMS releases; the NRT-to-standard effect cannot be measured with this download.'
            }
        }
        result = dict(params=dict(grid_deg=config.GRID_DEG, calibration_years=config.CALIBRATION_YEARS,
            test_years=config.TEST_YEARS, simultaneous_max_minutes=config.SIMULTANEOUS_MAX_MINUTES,
            ci_level=config.CI_LEVEL), detection=detection, validation=validation,
            emulator={k: emulator[k] for k in EMULATOR_FIELDS}, periods=periods(con, sensitivity.get('partial_through')), findings=findings)
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
