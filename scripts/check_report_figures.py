import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/report/firechronos-technical-report.html'
RANGES = ROOT / 'docs/report/figures/season-ranges.json'
EXPORTS = ROOT / 'docs/report/figures/report-exports.json'
EXPORT_SOURCES = ('detection_probs.parquet', 'capture_segments.parquet', 'estimates.parquet', 'mapbiomas.parquet', 'sensitivity.json')


def read(name):
    return json.loads((ROOT / 'data/processed' / f'{name}.json').read_text())


def aggregate_ranges():
    import duckdb
    from config import CI_LEVEL

    path = ROOT / 'data/interim/series_replicates.parquet'
    con = duckdb.connect()
    alpha = (1 - CI_LEVEL) / 2
    rows = con.execute('''SELECT region, quantile_cont(total, ?) AS low,
        quantile_cont(total, ?) AS high FROM (
        SELECT region, replicate, sum(estimated) AS total
        FROM read_parquet(?) WHERE year=2026 AND month IN (8,9,10)
        GROUP BY region,replicate) GROUP BY region''',
        [alpha, 1-alpha, str(path)]).fetchall()
    payload = {'source': 'data/interim/series_replicates.parquet',
               'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
               'series_sha256': hashlib.sha256((ROOT / 'data/processed/series.json').read_bytes()).hexdigest(),
               'period': '2026-08/2026-10', 'ci_level': CI_LEVEL,
               'method': 'Quantiles of sums of aligned replicates, not sums of monthly endpoints.',
               'rows': {r: {'low': lo, 'high': hi} for r, lo, hi in rows}}
    RANGES.write_text(json.dumps(payload, indent=2) + '\n')


def export_interim():
    import duckdb
    from config import CALIBRATION_YEARS, FIRST_YEAR, HISTORY_YEARS, MACROREGION_DEPARTMENTS, NATIONAL, TEST_YEARS
    from validate import slug

    interim = ROOT / 'data/interim'
    sensitivity = json.loads((interim / 'sensitivity.json').read_text())
    con = duckdb.connect()
    def rows(sql, params=()):
        cursor = con.execute(sql, list(params))
        names = [d[0] for d in cursor.description]
        return [dict(zip(names, r)) for r in cursor.fetchall()]
    detection = rows('''SELECT region, month, n1, n2, m, N, p1, p1_low, p1_high, p2, p2_low, p2_high, pooled
        FROM read_parquet(?) WHERE sensor_pair='aqua_snpp' ORDER BY region, month''', [str(interim / 'detection_probs.parquet')])
    con.execute('CREATE TABLE factors (region VARCHAR, month INTEGER, factor DOUBLE)')
    con.executemany('INSERT INTO factors VALUES (?,?,?)', [(r['region'], r['month'], r['factor']) for r in sensitivity['aqua_bias']['factors']])
    heldout = rows('''WITH c AS (SELECT region, year, month, estimated_from_aqua*factor AS predicted, estimated AS actual
            FROM read_parquet(?) JOIN factors USING (region, month) WHERE mode='both' AND year BETWEEN ? AND ?)
        SELECT region, year, sum(predicted) AS predicted, sum(actual) AS actual FROM c GROUP BY region, year
        UNION ALL SELECT ?, year, sum(predicted), sum(actual) FROM c GROUP BY year ORDER BY region, year''',
        [str(interim / 'capture_segments.parquet'), *TEST_YEARS, NATIONAL])
    con.execute('CREATE TABLE dep (department VARCHAR, region VARCHAR)')
    con.executemany('INSERT INTO dep VALUES (?,?)', [(slug(n), r) for r, names in MACROREGION_DEPARTMENTS.items() for n in names])
    con.create_function('slug', slug, ['VARCHAR'], 'VARCHAR')
    mapbiomas = rows('''WITH burned AS (
            SELECT d.region, m.year, sum(m.burned_ha) AS burned_ha FROM read_parquet(?) m
            JOIN dep d ON d.department = slug(m.territory_name) WHERE m.level='department' AND m.month IS NULL GROUP BY d.region, m.year
            UNION ALL SELECT ?, year, sum(burned_ha) FROM read_parquet(?) WHERE level='country' AND month IS NULL GROUP BY year),
        est AS (SELECT region, year, sum(estimated) AS estimated FROM read_parquet(?) WHERE year BETWEEN ? AND ? GROUP BY region, year)
        SELECT region, year, estimated, burned_ha FROM est JOIN burned USING (region, year) ORDER BY region, year''',
        [str(interim / 'mapbiomas.parquet'), NATIONAL, str(interim / 'mapbiomas.parquet'), str(interim / 'estimates.parquet'), FIRST_YEAR + 1, HISTORY_YEARS[1]])
    bias = [{k: r[k] for k in ('region', 'bias', 'bias_low', 'bias_high', 'significant', 'high_season', 'high_season_low',
             'high_season_high', 'low_season', 'low_season_low', 'low_season_high', 'seasonal')} for r in sensitivity['aqua_bias']['regions'].values()] \
        if isinstance(sensitivity['aqua_bias']['regions'], dict) else [{k: r[k] for k in ('region', 'bias', 'bias_low', 'bias_high', 'significant',
             'high_season', 'high_season_low', 'high_season_high', 'low_season', 'low_season_low', 'low_season_high', 'seasonal')} for r in sensitivity['aqua_bias']['regions']]
    payload = {'sources': {name: hashlib.sha256((interim / name).read_bytes()).hexdigest() for name in EXPORT_SOURCES},
               'calibration_years': list(CALIBRATION_YEARS), 'test_years': list(TEST_YEARS),
               'method': 'Small exports of intermediate products used by report figures; heldout follows scripts/validate.py, mapbiomas follows its correlation query.',
               'detection': detection, 'aqua_bias': bias, 'aqua_bias_factors': sensitivity['aqua_bias']['factors'],
               'heldout': heldout, 'mapbiomas': mapbiomas,
               'overpass': [r for r in sensitivity['overpass_diagnostics'] if r['period'] == 'calibration' and r['scan_tercile'] is None]}
    EXPORTS.write_text(json.dumps(payload, indent=1) + '\n')


def report_values():
    s, m, f, c = [read(n) for n in ('series', 'methodology', 'forecast', 'continuity')]
    values = {}
    def put(key, value, digits=1):
        values[key] = f'{value:,.{digits}f}'
    for y in (2011, 2012):
        put(f'raw_{y}', sum(r['raw_detections'] for r in s if r['region']=='peru' and r['year']==y and not r['is_forecast']), 0)
    put('jump', float(values['raw_2012'].replace(',', ''))/float(values['raw_2011'].replace(',', '')), 2)
    for r in m['validation']:
        for k in ('error_pct_method', 'error_pct_naive', 'mapbiomas_corr'):
            put(f"{r['region']}_{k}", r[k], 3 if k=='mapbiomas_corr' else 2)
    for r in m['forecast']['raw_vs_corrected']['trend']:
        if r['region']=='peru': put('trend_'+r['series'], r['pct_per_year'], 2)
    for y, mo in ((2005,8),(2010,8),(2020,8),(2024,9)):
        row = next(r for r in s if r['region']=='peru' and r['year']==y and r['month']==mo)
        for k in ('estimated','est_low','est_high'): put(f'month_{y}_{mo}_{k}', row[k], 0)
    ranges = json.loads(RANGES.read_text())
    assert ranges['series_sha256'] == hashlib.sha256((ROOT/'data/processed/series.json').read_bytes()).hexdigest(), 'Rebuild seasonal ranges for changed series'
    for r in f['out_of_sample']['rows']:
        if r['lead']==1 and r['published_method'] and r['level'] in ('country','macro'):
            for k in ('median','low','high','observed'): put(f"oos_{r['region']}_{k}", r[k], 0)
            for k in ('low','high'): put(f"oos_{r['region']}_observed_{k}",ranges['rows'][r['region']][k],0)
            expected = sum(x['estimated'] for x in s if x['region']==r['region'] and x['year']==2026 and x['month'] in f['season_months'] and not x['is_forecast'])
            assert abs(expected-r['observed']) < 1, (expected,r)
    for r in f['regions'][0]['skill_by_lead']: put(f"rpss_{r['lead']}",r['rpss'],3)
    for r in f['metrics']['by_lead']:
        if r['level']=='department':
            put(f"departments_{r['lead']}",r['units_with_skill'],0)
            put('departments_active',r['units'],0)
    for r in f['raw_vs_corrected']['rows']:
        if r['region']=='peru': put('forecast_ratio_'+r['series'],r['median_observed_over_predicted'],2)
    for r in c['metrics']['emulator_by_year']:
        if r['region']=='peru' and r['year'] in (2023,2024,2025,2026): put(f"drift_{r['year']}",r['aqua_vs_emulated_pct'],1)
    row = next(r for r in c['rows'] if r['region']=='peru' and r['month']=='2026-09')
    for k in ('aqua_observed','aqua_emulated','aqua_emulated_low','aqua_emulated_high'): put(k,row[k],0)
    put('auc',m['emulator']['auc'],3)
    for r in f['regions']:
        if r['region'] in ('costa', 'sierra'):
            put(f"rpss_{r['region']}_10", next(s['rpss'] for s in r['skill_by_lead'] if s['lead']==10), 3)
    pre = next(r for r in c['metrics']['summary'] if r['region']=='peru' and r['period']=='pre_drift')
    put('emu_pre_bias', pre['bias_pct'], 1); put('emu_pre_mape', pre['monthly_mape_pct'], 1); put('emu_pre_cov', 100*pre['range_coverage'], 1)
    exports = json.loads(EXPORTS.read_text())
    venn = exports['overpass'][0]
    assert (venn['gap_lower'], venn['gap_upper']) == (0, 20)
    for k in ('n1', 'n2', 'm'): put(f'venn_{k}', venn[k], 0)
    put('venn_N', (venn['n1']+1)*(venn['n2']+1)/(venn['m']+1)-1, 0)
    assert abs((venn['n1']+1)*(venn['n2']+1)/(venn['m']+1)-1 - venn['N_over_snpp']*venn['n2']) < 1
    detection = {(r['region'], r['month']): r for r in m['detection'] if r['region'] != 'peru'}
    for r in exports['detection']:
        assert abs(r['p1']-detection[(r['region'], r['month'])]['p_modis']) < 1e-9 and abs(r['p2']-detection[(r['region'], r['month'])]['p_viirs']) < 1e-9
        put(f"pA_{r['region']}_{r['month']}", r['p1'], 3); put(f"pS_{r['region']}_{r['month']}", r['p2'], 3)
    for r in exports['aqua_bias_factors']:
        if r['month'] in (1, 8): put(f"factor_{r['region']}_{r['month']}", r['factor'], 3)
    for r in exports['heldout']:
        put(f"held_{r['region']}_{r['year']}_a", r['predicted'], 0); put(f"held_{r['region']}_{r['year']}_v", r['actual'], 0)
    validation = {r['region']: r for r in m['validation']}
    for region in validation:
        rows = [r for r in exports['heldout'] if r['region']==region]
        assert abs(100*np.mean([abs(r['predicted']/r['actual']-1) for r in rows]) - validation[region]['error_pct_method']) < 1e-6
        pairs = np.array([(r['estimated'], r['burned_ha']) for r in exports['mapbiomas'] if r['region']==region])
        assert abs(np.corrcoef(pairs.T)[0, 1] - validation[region]['mapbiomas_corr']) < 1e-6
    put('emulator_error',m['emulator']['monthly_error_pct'],1)
    return values


class Checker(HTMLParser):
    def __init__(self, expected):
        super().__init__()
        self.expected, self.seen, self.active, self.parts = expected, set(), None, []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'data-check' in attrs:
            assert self.active is None
            self.active, self.parts = attrs['data-check'], []

    def handle_data(self, data):
        if self.active is not None: self.parts.append(data)

    def handle_endtag(self, tag):
        if tag=='span' and self.active is not None:
            actual = ''.join(self.parts).strip()
            assert actual == self.expected[self.active], f'{self.active}: HTML {actual}; data {self.expected[self.active]}'
            self.seen.add(self.active)
            self.active = None


def main():
    parser = argparse.ArgumentParser(description='Check visible report figures against processed JSON and the documented seasonal range export.')
    parser.add_argument('--aggregate-ranges', action='store_true')
    args = parser.parse_args()
    if args.aggregate_ranges:
        aggregate_ranges()
        export_interim()
    expected = report_values()
    checker = Checker(expected)
    checker.feed(REPORT.read_text())
    assert checker.seen == expected.keys(), f'Missing checked values: {expected.keys()-checker.seen}'
    provenance = json.loads((RANGES.parent / 'provenance.json').read_text())
    for relative, expected_hash in provenance.items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected_hash, f'Regenerate figures: {relative}'
    interim = ROOT / 'data/interim'
    if (interim / 'sensitivity.json').exists():
        for name, digest in json.loads(EXPORTS.read_text())['sources'].items():
            assert hashlib.sha256((interim / name).read_bytes()).hexdigest() == digest, f'Intermediate export source changed: {name}'
    source = ROOT / 'data/interim/series_replicates.parquet'
    if source.exists():
        assert hashlib.sha256(source.read_bytes()).hexdigest() == json.loads(RANGES.read_text())['source_sha256'], 'Intermediate range source changed'
    print(f'PASS: {len(checker.seen)} distinct numerical claims and figure provenance match their data sources.')


if __name__ == '__main__':
    main()
