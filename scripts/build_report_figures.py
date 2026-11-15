import hashlib
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from check_report_figures import read, ROOT

OUT = ROOT / 'docs/report/figures'
plt.rcParams.update({'font.family': 'DejaVu Serif', 'font.size': 9, 'axes.spines.top': False, 'axes.spines.right': False, 'svg.hashsalt': 'elis-paper'})


def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / f'{name}.svg', metadata={'Date': None})
    path = OUT / f'{name}.svg'
    path.write_text('\n'.join(line.rstrip() for line in path.read_text().splitlines()) + '\n')
    plt.close(fig)

BLUE, RED, GREY = '#235872', '#9c442f', '#7a7a7a'
REGION_COLORS = {'amazonia': '#3d7a4f', 'sierra': '#9a7b3c', 'costa': '#4f7fa8', 'peru': '#202020'}
REGION_LABELS = {'peru': 'Peru', 'amazonia': 'Amazon', 'sierra': 'Andes', 'costa': 'Coast'}


def rings(geometry):
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    return [np.asarray(polygon[0]) for polygon in polygons]


def study_area():
    from matplotlib.patches import Patch, Polygon
    geo = json.loads((ROOT / 'data/processed/regions.geojson').read_text())
    fig, ax = plt.subplots(figsize=(4.6, 5.0))
    for feature in geo['features']:
        props = feature['properties']
        if props.get('level') == 'macro':
            for ring in rings(feature['geometry']):
                ax.add_patch(Polygon(ring, closed=True, facecolor=REGION_COLORS[props['id']], alpha=.35, edgecolor='none'))
    for feature in geo['features']:
        props = feature['properties']
        if props.get('level') == 'department':
            for ring in rings(feature['geometry']):
                ax.add_patch(Polygon(ring, closed=True, fill=False, edgecolor='white', lw=.5))
        if props.get('level') == 'country':
            for ring in rings(feature['geometry']):
                ax.add_patch(Polygon(ring, closed=True, fill=False, edgecolor='#202020', lw=.8))
    ax.set_xlim(-81.6, -68.4); ax.set_ylim(-18.6, 0.2); ax.set_aspect(1 / np.cos(np.radians(9)))
    xt = np.arange(-80, -68, 4); yt = np.arange(-16, 1, 4)
    ax.set_xticks(xt, [f'{abs(v)}°W' for v in xt]); ax.set_yticks(yt, [f'{abs(v)}°S' if v else '0°' for v in yt])
    ax.grid(alpha=.15, lw=.5)
    ax.legend(handles=[Patch(facecolor=REGION_COLORS[r], alpha=.35, label=REGION_LABELS[r]) for r in ('amazonia', 'sierra', 'costa')],
              loc='lower left', fontsize=8, frameon=False, title='Macroregion', title_fontsize=8)
    ax.plot([-72.5, -72.5 + 1 / np.cos(np.radians(16))], [-17.5, -17.5], color='#202020', lw=1.5)
    ax.text(-72.5, -17.3, '~111 km', fontsize=7)
    save(fig, 'study-area')


def footprints_and_venn(exports):
    from matplotlib.patches import Circle, Rectangle
    fig, axes = plt.subplots(1, 2, figsize=(6.6, 2.9), gridspec_kw={'width_ratios': [1, 1.25]})
    ax = axes[0]
    ax.add_patch(Rectangle((0, 0), 11.1, 11.1, fill=False, edgecolor='#202020', lw=1.2))
    for i in range(11):
        for j in range(11):
            ax.add_patch(Rectangle((i * 1.0 + .05, j * 1.0 + .05), .9, .9, fill=False, edgecolor=RED, lw=.25, alpha=.6))
    for i in range(3):
        for j in range(3):
            ax.add_patch(Rectangle((6.2 + i * .375, 2.0 + j * .375), .375, .375, facecolor=BLUE, alpha=.55, edgecolor='white', lw=.2))
    ax.add_patch(Rectangle((2, 7), 1, 1, facecolor=RED, alpha=.5))
    ax.text(3.2, 7.25, 'MODIS pixel, ~1 km at nadir', fontsize=7)
    ax.text(6.2, 1.25, 'VIIRS I-band pixels, 375 m', fontsize=7)
    ax.text(0, 11.5, '0.1° grid cell (~11 km)', fontsize=7.5)
    ax.set_xlim(-.3, 11.6); ax.set_ylim(-.3, 12.3); ax.set_aspect(1); ax.axis('off')
    ax.set_title('(a) Footprints within one cell', loc='left', fontsize=9)
    row = exports['overpass'][0]
    n1, n2, m = row['n1'], row['n2'], row['m']
    N = (n1 + 1) * (n2 + 1) / (m + 1) - 1
    ax = axes[1]
    ra, rs = np.sqrt(n1 / np.pi), np.sqrt(n2 / np.pi)
    ax.add_patch(Circle((0, 0), rs, facecolor=BLUE, alpha=.3, edgecolor=BLUE))
    ax.add_patch(Circle((rs - ra * .55, 0), ra, facecolor=RED, alpha=.35, edgecolor=RED))
    ax.text(-rs * .35, 0, f'S-NPP only\n{n2 - m:,}', ha='center', va='center', fontsize=7.5)
    ax.text(rs - ra * .55, 0, f'm = {m:,}', ha='center', va='center', fontsize=7.5)
    ax.text(rs + ra * .3, rs * .62, f'Aqua only {n1 - m:,}', ha='left', fontsize=7.5)
    ax.text(-rs, -rs * 1.28, f'$n_A$ = {n1:,}; $n_S$ = {n2:,}; Chapman $\\hat N$ = {N:,.0f}', fontsize=7.5)
    ax.set_xlim(-rs * 1.1, rs * 1.9); ax.set_ylim(-rs * 1.4, rs * 1.15); ax.set_aspect(1); ax.axis('off')
    ax.set_title('(b) Aqua and S-NPP lists, gap < 20 min', loc='left', fontsize=9)
    save(fig, 'footprints-venn')
    return dict(n1=n1, n2=n2, m=m, N=N)


def detection_fractions(exports):
    fig, axes = plt.subplots(1, 2, figsize=(6.6, 2.7), sharex=True)
    months = np.arange(1, 13)
    for region in ('amazonia', 'sierra', 'costa'):
        rows = sorted((r for r in exports['detection'] if r['region'] == region), key=lambda r: r['month'])
        for ax, key in zip(axes, ('p1', 'p2')):
            value = np.array([r[key] for r in rows]); low = np.array([r[key + '_low'] for r in rows]); high = np.array([r[key + '_high'] for r in rows])
            ax.plot(months, value, color=REGION_COLORS[region], marker='o', ms=2.5, lw=1, label=REGION_LABELS[region])
            ax.fill_between(months, low, high, color=REGION_COLORS[region], alpha=.15)
    axes[0].set_title('(a) Aqua MODIS, $\\hat p_A$', loc='left', fontsize=9)
    axes[1].set_title('(b) S-NPP VIIRS, $\\hat p_S$', loc='left', fontsize=9)
    for ax in axes:
        ax.set_xticks(months, list('JFMAMJJASOND')); ax.set_ylim(0, 1); ax.grid(axis='y', alpha=.2); ax.set_xlabel('Calendar month')
    axes[0].set_ylabel('Detection fraction'); axes[1].legend(fontsize=7.5, loc='lower right', title='Shaded: 90% bootstrap range', title_fontsize=7)
    save(fig, 'detection-fractions')


def heldout_validation(exports):
    fig, ax = plt.subplots(figsize=(3.6, 3.4))
    rows = exports['heldout']
    top = max(max(r['predicted'], r['actual']) for r in rows) * 1.08 / 1e3
    ax.plot([0, top], [0, top], color=GREY, lw=.8, ls='--', label='1:1')
    for region in ('peru', 'amazonia', 'sierra', 'costa'):
        sel = [r for r in rows if r['region'] == region]
        ax.scatter([r['actual'] / 1e3 for r in sel], [r['predicted'] / 1e3 for r in sel], s=16, color=REGION_COLORS[region], label=REGION_LABELS[region], zorder=3)
    ax.set_xlim(0, top); ax.set_ylim(0, top); ax.set_aspect(1)
    ax.set_xlabel('VIIRS-based (10³ fire cell-days / year)'); ax.set_ylabel('Aqua-based (10³ fire cell-days / year)')
    ax.grid(alpha=.2); ax.legend(fontsize=7, loc='upper left')
    save(fig, 'heldout-validation')


def forecast_skill(f):
    fig, axes = plt.subplots(1, 2, figsize=(6.6, 2.7), gridspec_kw={'width_ratios': [1, 1.1]})
    for region in ('peru', 'amazonia', 'sierra', 'costa'):
        row = next(r for r in f['regions'] if r['region'] == region)
        leads = [s['lead'] for s in row['skill_by_lead']]
        axes[0].plot(leads, [s['rpss'] for s in row['skill_by_lead']], marker='o', ms=3, lw=1.2 if region == 'peru' else .9,
                     color=REGION_COLORS[region], label=REGION_LABELS[region])
    axes[0].axhline(0, color=GREY, lw=.7); axes[0].axhline(0.05, color=GREY, lw=.6, ls=':')
    axes[0].set_xticks([1, 4, 7, 10]); axes[0].set_xlabel('Lead (months)'); axes[0].set_ylabel('RPSS vs climatology')
    axes[0].set_title('(a) Country and macroregions', loc='left', fontsize=9); axes[0].legend(fontsize=7); axes[0].grid(axis='y', alpha=.2)
    rng = np.random.default_rng(42)
    departments = [r for r in f['regions'] if r['level'] == 'department' and r.get('active')]
    for k, lead in enumerate((1, 4, 7, 10)):
        values = [s['rpss'] for r in departments for s in r['skill_by_lead'] if s['lead'] == lead]
        axes[1].scatter(k + rng.uniform(-.15, .15, len(values)), values, s=9, color=BLUE, alpha=.7)
        axes[1].plot([k - .25, k + .25], [np.median(values)] * 2, color=RED, lw=1.5)
    axes[1].axhline(0, color=GREY, lw=.7); axes[1].axhline(0.05, color=GREY, lw=.6, ls=':')
    axes[1].set_xticks(range(4), ['1', '4', '7', '10']); axes[1].set_xlabel('Lead (months)')
    axes[1].set_title(f'(b) {len(departments)} eligible departments (red: median)', loc='left', fontsize=9); axes[1].grid(axis='y', alpha=.2)
    save(fig, 'forecast-skill')


def mapbiomas_scatter(exports):
    fig, axes = plt.subplots(1, 4, figsize=(6.8, 2.1))
    out = {}
    for ax, region in zip(axes, ('peru', 'amazonia', 'sierra', 'costa')):
        rows = [r for r in exports['mapbiomas'] if r['region'] == region]
        x = np.array([r['burned_ha'] for r in rows]) / 1e3; y = np.array([r['estimated'] for r in rows]) / 1e3
        r = float(np.corrcoef(x, y)[0, 1]); out[region] = r
        ax.scatter(x, y, s=8, color=REGION_COLORS[region])
        ax.set_title(f'{REGION_LABELS[region]}, r = {r:.3f}', loc='left', fontsize=8.5)
        ax.set_xlabel('Burned area (10³ ha)', fontsize=7.5); ax.tick_params(labelsize=7); ax.grid(alpha=.2)
    axes[0].set_ylabel('Fire cell-days (10³)', fontsize=7.5)
    save(fig, 'mapbiomas')
    return out


def emulator_drift(c):
    fig, axes = plt.subplots(1, 2, figsize=(6.6, 2.8), gridspec_kw={'width_ratios': [1, 1.2]})
    rows = [r for r in c['rows'] if r['region'] == 'peru' and r['aqua_observed'] is not None and r['aqua_emulated'] is not None and not r['partial_coverage']]
    pre = [r for r in rows if int(r['month'][:4]) <= 2022]; post = [r for r in rows if int(r['month'][:4]) >= 2023]
    top = max(max(r['aqua_observed'], r['aqua_emulated']) for r in rows) * 1.05
    axes[0].plot([0, top], [0, top], color=GREY, lw=.8, ls='--')
    axes[0].scatter([r['aqua_emulated'] for r in pre], [r['aqua_observed'] for r in pre], s=7, color=BLUE, alpha=.7, label='2013-2022')
    axes[0].scatter([r['aqua_emulated'] for r in post], [r['aqua_observed'] for r in post], s=9, color=RED, alpha=.8, marker='^', label='2023-2026 (drift)')
    axes[0].set_xlim(0, top); axes[0].set_ylim(0, top); axes[0].set_aspect(1)
    axes[0].set_xlabel('Emulated Aqua (cell-days / month)'); axes[0].set_ylabel('Observed Aqua (cell-days / month)')
    axes[0].legend(fontsize=7, loc='upper left'); axes[0].grid(alpha=.2)
    axes[0].set_title('(a) Monthly, Peru', loc='left', fontsize=9)
    years = [r for r in c['metrics']['emulator_by_year'] if r['region'] == 'peru']
    axes[1].bar([r['year'] for r in years], [r['aqua_vs_emulated_pct'] for r in years],
                color=[RED if r['year'] >= 2023 else BLUE for r in years], width=.7)
    axes[1].set_xticks([2013, 2016, 2019, 2022, 2025]); axes[1].axhline(0, color='#202020', lw=.7); axes[1].set_ylabel('Observed vs emulated (%)'); axes[1].set_xlabel('Year (2026 partial)')
    axes[1].set_title('(b) Annual relative difference', loc='left', fontsize=9); axes[1].grid(axis='y', alpha=.2)
    save(fig, 'emulator-drift')



def main():
    s, f, c = [read(n) for n in ('series','forecast','continuity')]
    rows = [r for r in s if r['region']=='peru' and 2003<=r['year']<=2025 and not r['is_forecast']]
    x = [r['year']+(r['month']-.5)/12 for r in rows]
    fig, axes = plt.subplots(2,1,figsize=(6.4,3.4),sharex=True)
    axes[0].plot(x,[r['raw_detections'] for r in rows],color='#9c442f',lw=1)
    axes[0].set_ylabel('Detections / month')
    axes[0].set_title('(a) Naive sum across available sensors',loc='left',fontsize=10)
    axes[1].plot(x,[r['estimated'] for r in rows],color='#235872',lw=1)
    axes[1].fill_between(x,[r['est_low'] for r in rows],[r['est_high'] for r in rows],color='#235872',alpha=.22,label='90% range')
    axes[1].set_ylabel('Fire cell-days / month')
    axes[1].set_title('(b) Harmonized reconstruction',loc='left',fontsize=10)
    for ax in axes:
        ax.axvline(2012,color='.5',ls='--',lw=.7);ax.grid(axis='y',alpha=.2)
    axes[1].legend(loc='upper right');axes[1].set_xlabel('Year')
    save(fig,'record')
    rows=[r for r in f['out_of_sample']['rows'] if r['lead']==1 and r['published_method'] and r['level'] in ('country','macro')]
    ranges=json.loads((OUT/'season-ranges.json').read_text())['rows']
    fig,ax=plt.subplots(figsize=(6.4,2.7))
    y=np.arange(len(rows))
    for i,r in enumerate(rows):
        ax.errorbar(r['median'],i+.1,xerr=[[r['median']-r['low']],[r['high']-r['median']]],fmt='o',color='#235872',capsize=3,label='Forecast: 90% predictive range' if i==0 else None)
        lo,hi=(ranges[r['region']][k] for k in ('low','high'))
        ax.errorbar(r['observed'],i-.1,xerr=[[r['observed']-lo],[hi-r['observed']]],fmt='s',color='#9c442f',capsize=3,label='NRT reconstruction: 90% calibration range' if i==0 else None)
    ax.set_yticks(y,['Peru','Amazon','Andes','Coast']);ax.invert_yaxis();ax.set_xlabel('Fire cell-days, August-October 2026');ax.legend(fontsize=8,loc='lower right');ax.grid(axis='x',alpha=.2)
    save(fig,'forecast-2026')
    rows=[r for r in c['rows'] if r['region']=='peru' and r['month'].startswith('2026-') and r['month']<='2026-10']
    fig,ax=plt.subplots(figsize=(6.4,2.5))
    x=list(range(1,len(rows)+1))
    ax.plot(x,[r['aqua_emulated'] for r in rows],color='#235872',label='Emulated Aqua')
    ax.fill_between(x,[r['aqua_emulated_low'] for r in rows],[r['aqua_emulated_high'] for r in rows],color='#235872',alpha=.2,label='90% range')
    ax.plot(x,[r['aqua_observed'] for r in rows],color='#9c442f',marker='.',label='Observed Aqua')
    ax.set_xticks(x);ax.set_xlabel('Month, 2026');ax.set_ylabel('Aqua fire cell-days / month');ax.legend(fontsize=8);ax.grid(axis='y',alpha=.2)
    save(fig,'aqua-drift')
    exports = json.loads((OUT / 'report-exports.json').read_text())
    study_area()
    footprints_and_venn(exports)
    detection_fractions(exports)
    heldout_validation(exports)
    forecast_skill(f)
    mapbiomas_scatter(exports)
    emulator_drift(c)
    paths = [ROOT / 'data/processed' / f'{name}.json' for name in ('series', 'forecast', 'continuity')]
    paths += [ROOT / 'data/processed/regions.geojson', OUT / 'season-ranges.json', OUT / 'report-exports.json'] + sorted(OUT.glob('*.svg'))
    hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    (OUT / 'provenance.json').write_text(json.dumps(hashes, indent=2) + '\n')


if __name__=='__main__':
    main()
