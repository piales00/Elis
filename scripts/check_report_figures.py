import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/report/firechronos-technical-report.html'
RANGES = ROOT / 'docs/report/figures/season-ranges.json'


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
    if args.aggregate_ranges: aggregate_ranges()
    expected = report_values()
    checker = Checker(expected)
    checker.feed(REPORT.read_text())
    assert checker.seen == expected.keys(), f'Missing checked values: {expected.keys()-checker.seen}'
    provenance = json.loads((RANGES.parent / 'provenance.json').read_text())
    for relative, expected_hash in provenance.items():
        assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected_hash, f'Regenerate figures: {relative}'
    source = ROOT / 'data/interim/series_replicates.parquet'
    if source.exists():
        assert hashlib.sha256(source.read_bytes()).hexdigest() == json.loads(RANGES.read_text())['source_sha256'], 'Intermediate range source changed'
    print(f'PASS: {len(checker.seen)} distinct numerical claims and figure provenance match their data sources.')


if __name__ == '__main__':
    main()
