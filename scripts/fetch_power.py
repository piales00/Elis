import json
import time
import urllib.parse
import urllib.request

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape

import config


USER_AGENT = 'power-monthly-client/1.0'
PAUSE_SECONDS = 1.0
TIMEOUT_SECONDS = 120
RETRIES = 3
FILL_VALUE = -999.0
OUTPUT = config.INTERIM_DIR / 'climate_monthly.parquet'


def region_shapes():
    collection = json.loads((config.PROCESSED_DIR / 'regions.geojson').read_text())
    return {f['properties']['id']: shape(f['geometry']) for f in collection['features']
            if f['properties']['id'] in config.REGIONS}


def grid_points(polygon, step):
    west, south, east, north = polygon.bounds
    lons = np.arange(np.floor(west / step) * step + step / 2, east, step)
    lats = np.arange(np.floor(south / step) * step + step / 2, north, step)
    return [(round(float(lat), 3), round(float(lon), 3)) for lat in lats for lon in lons
            if polygon.contains(Point(lon, lat))]


def region_points(polygon):
    step = config.POWER_GRID_DEG
    points = grid_points(polygon, step)
    while len(points) < config.POWER_MIN_POINTS:
        step /= 2
        points = grid_points(polygon, step)
    return points


def point_path(lat, lon):
    years = '_'.join(map(str, config.POWER_YEARS))
    return config.POWER_DIR / f'power_{lat:+.3f}_{lon:+.3f}_{years}.json'


def download(lat, lon):
    path = point_path(lat, lon)
    if path.exists():
        return json.loads(path.read_text()), False
    query = urllib.parse.urlencode({
        'parameters': ','.join(config.POWER_PARAMETERS), 'community': config.POWER_COMMUNITY,
        'latitude': lat, 'longitude': lon, 'start': config.POWER_YEARS[0],
        'end': config.POWER_YEARS[1], 'format': 'JSON'})
    request = urllib.request.Request(f'{config.POWER_URL}?{query}', headers={'User-Agent': USER_AGENT})
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                body = response.read()
            value = json.loads(body)
            value['properties']['parameter']
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
            return value, True
        except Exception:
            if attempt == RETRIES - 1:
                raise
            time.sleep(PAUSE_SECONDS * (attempt + 2))


def point_rows(value, region, lat, lon):
    parameters = value['properties']['parameter']
    rows = {}
    for name in config.POWER_PARAMETERS:
        for key, number in parameters[name].items():
            year, month = int(key[:4]), int(key[4:])
            if month > 12 or number is None or number == FILL_VALUE:
                continue
            rows.setdefault((year, month), {})[name] = float(number)
    return [dict(region=region, lat=lat, lon=lon, year=y, month=m, **v) for (y, m), v in rows.items()
            if len(v) == len(config.POWER_PARAMETERS)]


def main():
    rows, counts, downloaded = [], {}, 0
    for region, polygon in region_shapes().items():
        points = region_points(polygon)
        counts[region] = len(points)
        for lat, lon in points:
            value, fresh = download(lat, lon)
            if fresh:
                downloaded += 1
                time.sleep(PAUSE_SECONDS)
            rows.extend(point_rows(value, region, lat, lon))
    points = pd.DataFrame(rows)
    columns = {'PRECTOTCORR': 'precip_mm_day', 'T2M': 't2m_c'}
    regional = (points.groupby(['region', 'year', 'month'])
                .agg(**{columns[p]: (p, 'mean') for p in config.POWER_PARAMETERS}, n_points=('lat', 'size'))
                .reset_index())
    national = (points.groupby(['year', 'month'])
                .agg(**{columns[p]: (p, 'mean') for p in config.POWER_PARAMETERS}, n_points=('lat', 'size'))
                .reset_index().assign(region=config.NATIONAL))
    climate = pd.concat([regional, national[regional.columns]], ignore_index=True)
    complete = climate.groupby(['year', 'month'])['region'].transform('size') == len(config.REGIONS) + 1
    full = climate.assign(n_expected=climate['region'].map({**counts, config.NATIONAL: sum(counts.values())}))
    climate = full[complete & (full['n_points'] == full['n_expected'])].drop(columns='n_expected')
    climate = climate.sort_values(['region', 'year', 'month']).reset_index(drop=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    climate.to_parquet(OUTPUT, index=False)
    print(json.dumps({'points': counts, 'downloaded': downloaded, 'rows': len(climate),
                      'first': f"{climate['year'].min()}-{climate[climate['year'] == climate['year'].min()]['month'].min():02d}",
                      'last': f"{climate['year'].max()}-{climate[climate['year'] == climate['year'].max()]['month'].max():02d}"}))


if __name__ == '__main__':
    main()
