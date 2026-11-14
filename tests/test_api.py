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


MAP_FIELDS = ['lat', 'lon', 'raw_terra', 'raw_aqua', 'raw_modis', 'raw_viirs', 'estimated']


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


def test_map_before_viirs_has_null_viirs(client):
    rows = client.get('/map', params={'year': 2005, 'month': 9}).json()
    assert rows and all(r['raw_viirs'] is None for r in rows)


def test_methodology(client):
    response = client.get('/methodology')
    assert response.status_code == 200
    body = response.json()
    assert {'params', 'detection', 'validation', 'emulator'} <= set(body)
    assert {r['region'] for r in body['detection']} == set(config.REGIONS)
    filtered = client.get('/methodology', params={'region': 'sierra'}).json()
    assert filtered['detection'] and all(r['region'] == 'sierra' for r in filtered['detection'])
    assert len(filtered['detection']) == 12
    assert [r['region'] for r in filtered['validation']] == ['sierra']
    assert filtered['emulator'] == body['emulator']
    national = client.get('/methodology', params={'region': config.NATIONAL}).json()
    assert national['detection'] == [] and [r['region'] for r in national['validation']] == [config.NATIONAL]


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
])
def test_validation_errors(client, path, params):
    response = client.get(path, params=params)
    assert response.status_code == 422
    assert 'detail' in response.json()
