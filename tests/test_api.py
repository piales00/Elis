import json
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))

import config
from api.main import app


MAP_FIELDS = ['lat', 'lon', 'raw_terra', 'raw_aqua', 'raw_modis', 'raw_viirs',
              'raw_viirs_noaa20', 'raw_viirs_noaa21', 'estimated']


@pytest.fixture(scope='module')
def client():
    return TestClient(app)


@pytest.fixture(scope='module')
def series():
    return json.loads((config.PROCESSED_DIR / 'series.json').read_text())


def test_regions(client):
    response = client.get('/regions')
    assert response.status_code == 200
    body = response.json()
    assert body['type'] == 'FeatureCollection'
    ids = {f['properties']['id'] for f in body['features']}
    assert {config.NATIONAL, *config.REGIONS} <= ids
    assert len(body['features']) == 1 + len(config.REGIONS) + len(set().union(*config.MACROREGION_DEPARTMENTS.values()))


def test_series_filtered(client, series):
    response = client.get('/series', params={'region': 'amazonia', 'from': 2020, 'to': 2024})
    assert response.status_code == 200
    rows = response.json()
    expected = [r for r in series if r['region'] == 'amazonia' and 2020 <= r['year'] <= 2024]
    assert len(rows) == len(expected) == 60
    assert rows == sorted(expected, key=lambda r: (r['year'], r['month']))
    assert all(r['region'] == 'amazonia' for r in rows)


def test_map_all_regions(client):
    response = client.get('/map', params={'year': 2024, 'month': 9})
    assert response.status_code == 200
    rows = response.json()
    assert rows
    assert all(list(r) == MAP_FIELDS for r in rows)
    sample = json.loads((config.PROCESSED_DIR / 'map-sample-2024-09.json').read_text())
    assert rows == sample
    total = sum(r['estimated'] for r in rows)
    national = next(r for r in json.loads((config.PROCESSED_DIR / 'series.json').read_text())
                    if (r['region'], r['year'], r['month']) == (config.NATIONAL, 2024, 9))
    assert total == pytest.approx(national['estimated'], rel=0.005, abs=1)


def test_map_by_region(client):
    full = client.get('/map', params={'year': 2024, 'month': 9}).json()
    parts = []
    for region in config.REGIONS:
        response = client.get('/map', params={'year': 2024, 'month': 9, 'region': region})
        assert response.status_code == 200
        rows = response.json()
        assert rows and all(list(r) == MAP_FIELDS for r in rows)
        parts.extend(rows)
    assert sorted(parts, key=lambda r: (r['lat'], r['lon'])) == full
    assert client.get('/map', params={'year': 2024, 'month': 9, 'region': 'atlantis'}).json() == []


def test_map_by_country_returns_all_macroregions(client):
    params = {'year': 2024, 'month': 9}
    full = client.get('/map', params=params).json()
    country = client.get('/map', params={**params, 'region': 'peru'}).json()
    assert country == full


def test_map_before_viirs_has_null_viirs(client):
    rows = client.get('/map', params={'year': 2005, 'month': 9}).json()
    assert rows and all(r['raw_viirs'] is None for r in rows)


def test_methodology(client):
    response = client.get('/methodology')
    assert response.status_code == 200
    body = response.json()
    assert {'params', 'detection', 'validation', 'emulator'} <= set(body)
    assert {r['region'] for r in body['detection']} == {*config.REGIONS, config.NATIONAL}
    filtered = client.get('/methodology', params={'region': 'sierra'}).json()
    assert filtered['detection'] and all(r['region'] == 'sierra' for r in filtered['detection'])
    assert len(filtered['detection']) == 12
    assert [r['region'] for r in filtered['validation']] == ['sierra']
    assert filtered['emulator'] == body['emulator']
    national = client.get('/methodology', params={'region': config.NATIONAL}).json()
    assert [r['region'] for r in national['validation']] == [config.NATIONAL]
    assert len(national['detection']) == 12 and all(r['region'] == config.NATIONAL for r in national['detection'])
    for month in range(1, 13):
        regional = [r for r in body['detection'] if r['month'] == month and r['region'] in config.REGIONS]
        row = next(r for r in national['detection'] if r['month'] == month)
        for name in ('n_modis', 'n_viirs', 'n_both'):
            assert row[name] == sum(r[name] for r in regional)
        assert 0 < row['p_modis'] < row['p_viirs'] < 1


def test_forecast(client):
    body = client.get('/forecast').json()
    stored = json.loads((config.PROCESSED_DIR / 'forecast.json').read_text())
    assert body == stored
    ids = {r['region'] for r in body['regions']}
    assert {config.NATIONAL, *config.REGIONS} <= ids
    for region in (config.NATIONAL, 'sierra', 'cusco'):
        response = client.get('/forecast', params={'region': region})
        assert response.status_code == 200
        filtered = response.json()
        assert [r['region'] for r in filtered['regions']] == [region]
        assert filtered['backtest']['rows'] and all(r['region'] == region for r in filtered['backtest']['rows'])
        assert all(r['region'] == region for r in filtered['out_of_sample']['rows'])
        assert filtered['metrics'] == body['metrics']
    missing = client.get('/forecast', params={'region': 'atlantis'})
    assert missing.status_code == 404
    assert missing.json()['detail'] == "No forecast entry for region 'atlantis'."


def test_series_reaches_last_data_month(client):
    rows = [r for r in client.get('/series', params={'region': config.NATIONAL, 'from': config.LAST_DATA_DATE.year}).json()
            if not r['is_forecast']]
    assert (rows[-1]['year'], rows[-1]['month']) == (config.LAST_DATA_DATE.year, config.LAST_DATA_DATE.month)
    assert client.get('/map', params={'year': config.LAST_DATA_DATE.year, 'month': config.LAST_DATA_DATE.month}).json()


@pytest.mark.parametrize('path, params', [
    ('/series', {}),
    ('/series', {'region': ''}),
    ('/series', {'region': 'amazonia', 'from': 2024, 'to': 2020}),
    ('/series', {'region': 'amazonia', 'from': 1999}),
    ('/series', {'region': 'amazonia', 'to': 'abc'}),
    ('/map', {}),
    ('/map', {'year': 2024}),
    ('/map', {'year': 2024, 'month': 13}),
    ('/map', {'year': 2024, 'month': 0}),
    ('/map', {'year': 1999, 'month': 9}),
    ('/map', {'year': 2024, 'month': 9, 'region': ''}),
    ('/methodology', {'region': ''}),
    ('/forecast', {'region': ''}),
])
def test_validation_errors(client, path, params):
    response = client.get(path, params=params)
    assert response.status_code == 422
    assert 'detail' in response.json()


def test_cors_allows_get_from_any_origin_by_default(client):
    response = client.get('/regions', headers={'Origin': 'https://example.org'})
    assert response.headers['access-control-allow-origin'] == '*'
    preflight = client.options('/series', headers={'Origin': 'https://example.org', 'Access-Control-Request-Method': 'GET'})
    assert preflight.status_code == 200
    blocked = client.options('/series', headers={'Origin': 'https://example.org', 'Access-Control-Request-Method': 'POST'})
    assert blocked.status_code == 400


def test_error_messages_in_english(client, monkeypatch, tmp_path):
    response = client.get('/series', params={'region': 'amazonia', 'from': 2024, 'to': 2020})
    assert response.json()['detail'] == 'The start year cannot be later than the end year.'
    import api.main
    monkeypatch.setattr(api.main, 'PROCESSED_DIR', tmp_path)
    assert client.get('/series', params={'region': 'peru'}).json()['detail'] == 'series.json is not available yet.'
    assert client.get('/map', params={'year': 2024, 'month': 9}).json()['detail'] == 'map.parquet is not available yet.'
    assert client.get('/regions').status_code == 503
    assert client.get('/forecast').json()['detail'] == 'forecast.json is not available yet.'
