import json
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

import config
import live_predict as lp

FIXTURES = Path(__file__).resolve().parent / 'fixtures'
VIIRS_CSV = FIXTURES / 'firms_viirs_snpp_nrt.csv'
MODIS_CSV = FIXTURES / 'firms_modis_nrt.csv'
DAY = date(2026, 11, 12)
ASSETS = (lp.MODEL_NAME, lp.MASK_NAME, lp.CELL_REGIONS_NAME, lp.CALIBRATION_NAME)


@pytest.fixture
def live_dir(tmp_path, monkeypatch):
    for name in ASSETS:
        shutil.copy(config.LIVE_DIR / name, tmp_path / name)
    monkeypatch.setattr(config, 'INTERIM_DIR', tmp_path / 'no-interim')
    monkeypatch.delenv('FIRMS_MAP_KEY', raising=False)
    return tmp_path


def test_published_assets_are_small_and_complete():
    for name in ASSETS:
        assert (config.LIVE_DIR / name).is_file()
    assert (config.LIVE_DIR / lp.MODEL_NAME).stat().st_size < 2 * 1024 * 1024
    bundle = __import__('joblib').load(config.LIVE_DIR / lp.MODEL_NAME)
    assert set(bundle) == {'model', 'features', 'region_categories', 'rates', 'train_years'}
    assert bundle['features'] == lp.FEATURES
    calibration = json.loads((config.LIVE_DIR / lp.CALIBRATION_NAME).read_text())
    for source in ('snpp', 'noaa20'):
        rows = calibration['sources'][source]['regions']
        assert [r['region'] for r in rows] == [config.NATIONAL, *config.REGIONS]
        assert all(0.8 <= r['coverage_in_sample'] <= 1 and r['sigma'] in config.LIVE_SIGMA_GRID for r in rows)
    board = json.loads((config.LIVE_DIR / lp.SCOREBOARD_NAME).read_text())
    assert {'unit', 'ci_level', 'rows', 'summary'} <= set(board)


def test_predict_and_score_end_to_end(live_dir):
    prediction = lp.predict(DAY, live_dir, csv=VIIRS_CSV)
    stored = json.loads((live_dir / 'predictions' / '2026-11-12.json').read_text())
    assert stored == prediction and lp.verify(stored)
    assert stored['viirs_source'] == 'snpp' and stored['firms_source'] == 'VIIRS_SNPP_NRT'
    assert stored['viirs_detections'] == 5
    assert stored['model_version'].startswith('emulator-')
    assert stored['input_sha256'] == lp.sha256_bytes(VIIRS_CSV.read_bytes())
    regions = {r['region']: r for r in stored['regions']}
    assert [r['region'] for r in stored['regions']] == [config.NATIONAL, *config.REGIONS]
    assert {k: regions[k]['viirs_cell_days'] for k in regions} == {'peru': 4, 'amazonia': 2, 'sierra': 1, 'costa': 1}
    assert regions['peru']['aqua_predicted'] == pytest.approx(sum(regions[r]['aqua_predicted'] for r in config.REGIONS), abs=0.02)
    for row in stored['regions']:
        assert 0 <= row['aqua_low'] <= row['aqua_high']
        assert 0 < row['aqua_emulated'] <= row['viirs_cell_days'] + 1
    with pytest.raises(SystemExit, match='never overwritten'):
        lp.predict(DAY, live_dir, csv=VIIRS_CSV)
    again = lp.predict(DAY, live_dir, csv=VIIRS_CSV, force=True)
    assert again['regions'] == prediction['regions']

    board = lp.score(DAY, live_dir, csv=MODIS_CSV)
    rows = {r['region']: r for r in board['rows'] if r['date'] == '2026-11-12'}
    assert {k: rows[k]['observed'] for k in rows} == {'peru': 2, 'amazonia': 1, 'sierra': 0, 'costa': 1}
    for region, row in rows.items():
        entry = regions[region]
        assert row['predicted'] == entry['aqua_predicted']
        assert row['inside'] == (entry['aqua_low'] <= row['observed'] <= entry['aqua_high'])
        assert row['error'] == pytest.approx(row['observed'] - entry['aqua_predicted'], abs=0.01)
        assert row['prediction_sha256'] == again['sha256'] and row['status'] == 'scored'
    summary = {r['region']: r for r in board['summary']}
    assert summary['peru']['n_days'] == 1
    assert summary['amazonia']['coverage'] == float(rows['amazonia']['inside'])
    rescored = lp.score(DAY, live_dir, csv=MODIS_CSV)
    assert len(rescored['rows']) == 4


def test_score_rejects_tampered_or_missing_prediction(live_dir):
    with pytest.raises(SystemExit, match='No sealed prediction'):
        lp.score(DAY, live_dir, csv=MODIS_CSV)
    lp.predict(DAY, live_dir, csv=VIIRS_CSV)
    path = live_dir / 'predictions' / '2026-11-12.json'
    value = json.loads(path.read_text())
    value['regions'][0]['aqua_predicted'] += 1
    path.write_text(json.dumps(value))
    with pytest.raises(SystemExit, match='SHA-256'):
        lp.score(DAY, live_dir, csv=MODIS_CSV)


def test_auto_source_falls_back_to_noaa20(live_dir, tmp_path):
    lines = VIIRS_CSV.read_text().splitlines()
    only_n20 = tmp_path / 'n20.csv'
    only_n20.write_text('\n'.join([lines[0]] + [line for line in lines[1:] if ',N20,' in line]) + '\n')
    prediction = lp.predict(DAY, live_dir, csv=only_n20)
    assert lp.predict(DAY, live_dir, csv=VIIRS_CSV, source='noaa20', force=True)['viirs_source'] == 'noaa20'
    assert prediction['viirs_source'] == 'noaa20'
    assert prediction['regions'][0]['viirs_cell_days'] == 1


def test_missing_aqua_data_is_not_scored(live_dir, tmp_path):
    lp.predict(DAY, live_dir, csv=VIIRS_CSV)
    empty = tmp_path / 'empty.csv'
    empty.write_text(MODIS_CSV.read_text().splitlines()[0] + '\n')
    board = lp.score(DAY, live_dir, csv=empty)
    assert all(r['status'] == 'no_aqua_data' and r['observed'] is None for r in board['rows'])
    assert board['summary'] == []


def test_download_requires_key(live_dir):
    with pytest.raises(SystemExit, match='FIRMS_MAP_KEY is not set'):
        lp.predict(DAY, live_dir)


def test_cli_predict(live_dir):
    result = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'live_predict.py'), '--live-dir', str(live_dir),
                             'predict', '--date', '2026-11-12', '--csv', str(VIIRS_CSV)],
                            capture_output=True, text=True, env={'PATH': '/usr/bin:/bin'})
    assert result.returncode == 0, result.stderr
    assert 'sha256' in result.stdout


@pytest.mark.skipif(not (config.INTERIM_DIR / 'cells.parquet').is_file()
                    or not (config.RAW_DIR / 'viirs-snpp_nrt_2026_Peru.csv').is_file(),
                    reason='needs data/interim and data/raw')
@pytest.mark.parametrize('sensor, filename, day', [
    ('snpp', 'viirs-snpp_nrt_2026_Peru.csv', date(2026, 9, 10)),
    ('snpp', 'viirs-snpp_nrt_2026_Peru.csv', date(2026, 10, 3)),
    ('aqua', 'modis_nrt_2026_Peru.csv', date(2026, 9, 22)),
])
def test_live_cells_match_cells_parquet(sensor, filename, day):
    import duckdb

    raw = lp.read_firms((config.RAW_DIR / filename).read_bytes())
    cells, _ = lp.build_cells(raw, sensor, day, config.LIVE_DIR)
    reference = duckdb.sql(f"""
        SELECT cell_y, cell_x, region, n_points, frp_sum, frp_max, bright_max, scan_mean, track_mean, has_day, has_night
        FROM read_parquet('{config.INTERIM_DIR / 'cells.parquet'}') WHERE sensor = '{sensor}' AND date = DATE '{day}'
        ORDER BY cell_y, cell_x
    """).df()
    assert len(reference) > 0
    assert list(zip(cells.cell_y, cells.cell_x, cells.region)) == list(zip(reference.cell_y, reference.cell_x, reference.region))
    for column in ('n_points', 'frp_sum', 'frp_max', 'bright_max', 'scan_mean', 'track_mean', 'has_day', 'has_night'):
        assert cells[column].tolist() == pytest.approx(reference[column].tolist())
