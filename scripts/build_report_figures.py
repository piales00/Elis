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
    paths = [ROOT / 'data/processed' / f'{name}.json' for name in ('series', 'forecast', 'continuity')]
    paths += [OUT / 'season-ranges.json'] + sorted(OUT.glob('*.svg'))
    hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    (OUT / 'provenance.json').write_text(json.dumps(hashes, indent=2) + '\n')


if __name__=='__main__':
    main()
