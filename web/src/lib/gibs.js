import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export const GIBS_ATTRIBUTION = "Imagery: NASA GIBS / Worldview";
export const FIRMS_ATTRIBUTION = "Detections: NASA FIRMS via GIBS";
export const DEFAULT_IMAGERY_DAY = { year: 2024, month: 9, day: 10 };
export const RASTER_MAX_ZOOM = 9;
export const FOOTPRINT_MIN_ZOOM = 8;
export const FIRE_COLORS = { modis: "#ffb020", viirs: "#ff4fd8" };

const WMTS_3857 = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const WMTS_4326 = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";
const PERU_BBOX = [-81.5, -18.5, -68.5, 0.5];
const FIRE_TILE_LEVEL = 5;
const FIRE_TILE_DEGREES = 288 / 2 ** FIRE_TILE_LEVEL;

const TERRA_RANGES = [
  ["2000-02-24", "2000-04-25"], ["2000-04-28", "2000-08-06"], ["2000-08-18", "2001-06-15"], ["2001-07-03", "2002-03-19"],
  ["2002-03-28", "2003-12-16"], ["2003-12-24", "2008-12-20"], ["2008-12-23", "2016-02-18"], ["2016-02-27", "2022-10-10"],
  ["2022-10-23", "2025-08-08"], ["2025-08-10", "2025-11-08"], ["2025-11-10", null],
];
const TERRA_721_RANGES = [...TERRA_RANGES.slice(0, 8), ["2022-10-23", "2022-12-16"], ["2022-12-18", null]];
const AQUA_RANGES = [["2002-07-03", "2002-07-30"], ["2002-08-07", "2002-09-12"], ["2002-09-14", "2022-03-31"], ["2022-04-17", null]];
const AQUA_721_RANGES = [...AQUA_RANGES.slice(0, 3), ["2022-04-17", "2022-10-21"], ["2022-10-23", null]];
const SNPP_REFLECTANCE_RANGES = [
  ["2015-11-24", "2022-07-27"], ["2022-08-10", "2024-05-31"], ["2024-06-04", "2024-07-11"], ["2024-07-16", "2024-07-24"],
  ["2024-07-29", "2024-11-03"], ["2024-11-06", "2026-04-28"], ["2026-04-30", "2026-07-10"], ["2026-07-16", "2026-11-02"],
];

const IMAGERY = {
  truecolor: [
    { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", label: "VIIRS S-NPP", ranges: SNPP_REFLECTANCE_RANGES },
    { id: "MODIS_Aqua_CorrectedReflectance_TrueColor", label: "MODIS Aqua", ranges: AQUA_RANGES },
    { id: "MODIS_Terra_CorrectedReflectance_TrueColor", label: "MODIS Terra", ranges: TERRA_RANGES },
  ],
  swir: [
    { id: "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1", label: "VIIRS S-NPP", bands: "M11-I2-I1", ranges: SNPP_REFLECTANCE_RANGES },
    { id: "MODIS_Aqua_CorrectedReflectance_Bands721", label: "MODIS Aqua", bands: "7-2-1", ranges: AQUA_721_RANGES },
    { id: "MODIS_Terra_CorrectedReflectance_Bands721", label: "MODIS Terra", bands: "7-2-1", ranges: TERRA_721_RANGES },
  ],
};

const FIRES = {
  modis: [
    {
      id: "MODIS_Combined_Thermal_Anomalies_All",
      label: "MODIS Terra + Aqua",
      matrixSet: "1km",
      ranges: [["2002-07-04", "2023-07-08"], ["2023-07-10", null]],
    },
    {
      id: "MODIS_Terra_Thermal_Anomalies_All",
      label: "MODIS Terra",
      matrixSet: "1km",
      ranges: [
        ["2000-11-01", "2001-06-15"], ["2001-07-03", "2002-03-19"], ["2002-03-28", "2002-04-14"], ["2002-04-16", "2003-12-16"],
        ["2003-12-24", "2008-12-20"], ["2008-12-23", "2016-02-18"], ["2016-02-28", "2022-10-10"], ["2022-10-23", "2022-10-24"],
        ["2022-10-28", "2023-07-08"], ["2023-07-10", null],
      ],
    },
  ],
  viirs: [
    {
      id: "VIIRS_SNPP_Thermal_Anomalies_375m_All",
      label: "VIIRS S-NPP",
      matrixSet: "500m",
      ranges: [
        ["2012-01-20", "2012-03-24"], ["2012-03-26", "2014-08-24"], ["2014-08-26", "2020-03-17"], ["2020-03-19", "2022-07-26"],
        ["2022-08-23", "2022-12-24"], ["2022-12-26", "2023-02-02"], ["2023-02-04", "2023-07-08"], ["2023-07-10", "2024-05-28"],
        ["2024-05-31", "2024-05-31"], ["2024-06-05", "2024-07-10"], ["2024-07-18", "2024-07-24"], ["2024-07-30", "2024-09-25"],
        ["2024-09-30", "2024-11-03"], ["2024-11-09", "2026-04-28"], ["2026-04-30", "2026-07-10"], ["2026-07-16", "2026-11-02"],
      ],
    },
  ],
};

export function isoDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const TODAY = new Date().toISOString().slice(0, 10);

function inRanges(ranges, date) {
  return ranges.some(([from, to]) => date >= from && date <= (to ?? TODAY));
}

function pick(list, date) {
  return list.find((layer) => inRanges(layer.ranges, date)) ?? null;
}

export function imagerySatellites(mode, date) {
  return (IMAGERY[mode] ?? IMAGERY.truecolor).filter((layer) => inRanges(layer.ranges, date)).map((layer) => layer.label);
}

export function imageryLayer(mode, date, satellite) {
  const list = (IMAGERY[mode] ?? IMAGERY.truecolor).filter((layer) => inRanges(layer.ranges, date));
  const layer = list.find((l) => l.label === satellite) ?? list[0];
  if (!layer) return null;
  return {
    ...layer,
    tiles: [`${WMTS_3857}/${layer.id}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg`],
  };
}

export function fireLayers(date) {
  return { modis: pick(FIRES.modis, date), viirs: pick(FIRES.viirs, date) };
}

function tilesForBounds([west, south, east, north]) {
  const tiles = [];
  const colFrom = Math.floor((west + 180) / FIRE_TILE_DEGREES);
  const colTo = Math.floor((east + 180) / FIRE_TILE_DEGREES);
  const rowFrom = Math.floor((90 - north) / FIRE_TILE_DEGREES);
  const rowTo = Math.floor((90 - south) / FIRE_TILE_DEGREES);
  for (let row = rowFrom; row <= rowTo; row++) for (let col = colFrom; col <= colTo; col++) tiles.push({ row, col });
  return tiles;
}

function clipBounds(a, b) {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}

function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function featureContains(feature, lon, lat) {
  const { type, coordinates } = feature.geometry;
  const polygons = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : [];
  return polygons.some((rings) => ringContains(rings[0], lon, lat) && !rings.slice(1).some((hole) => ringContains(hole, lon, lat)));
}

const tileCache = new Map();

async function fetchTile(layer, date, { row, col }, signal) {
  const url = `${WMTS_4326}/${layer.id}/default/${date}/${layer.matrixSet}/${FIRE_TILE_LEVEL}/${row}/${col}.mvt`;
  if (tileCache.has(url)) return tileCache.get(url);
  const response = await fetch(url, { signal });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${layer.id})`);
  const tile = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
  const points = [];
  for (const vectorLayer of Object.values(tile.layers)) {
    for (let i = 0; i < vectorLayer.length; i++) {
      const p = vectorLayer.feature(i).properties;
      points.push({
        lat: p.LATITUDE,
        lon: p.LONGITUDE,
        scan: p.SCAN,
        track: p.TRACK,
        time: p.ACQ_TIME,
        satellite: p.SATELLITE,
        confidence: p.CONFIDENCE,
        frp: p.FRP,
        daynight: p.DAYNIGHT,
      });
    }
  }
  tileCache.set(url, points);
  return points;
}

export async function loadDetections(layer, date, area, signal) {
  if (!layer) return [];
  const bounds = clipBounds(area ? featureBoundsFlat(area) : PERU_BBOX, PERU_BBOX);
  const tiles = tilesForBounds(bounds);
  const batches = await Promise.all(tiles.map((tile) => fetchTile(layer, date, tile, signal)));
  const seen = new Set();
  const out = [];
  for (const batch of batches) {
    for (const p of batch) {
      const key = `${p.lat},${p.lon},${p.time},${p.satellite}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (p.lon < bounds[0] || p.lon > bounds[2] || p.lat < bounds[1] || p.lat > bounds[3]) continue;
      if (area && !featureContains(area, p.lon, p.lat)) continue;
      out.push(p);
    }
  }
  return out;
}

function featureBoundsFlat(feature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (node) => {
    if (typeof node[0] === "number") {
      minX = Math.min(minX, node[0]);
      maxX = Math.max(maxX, node[0]);
      minY = Math.min(minY, node[1]);
      maxY = Math.max(maxY, node[1]);
      return;
    }
    node.forEach(visit);
  };
  visit(feature.geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

export function detectionsToPoints(points) {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      properties: { scan: p.scan, track: p.track, time: p.time, satellite: p.satellite, confidence: p.confidence, frp: p.frp },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
}

export function detectionsToFootprints(points) {
  return {
    type: "FeatureCollection",
    features: points.map((p) => {
      const halfLon = p.scan / 2 / (111.32 * Math.cos((p.lat * Math.PI) / 180));
      const halfLat = p.track / 2 / 110.57;
      return {
        type: "Feature",
        properties: { scan: p.scan, track: p.track },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [p.lon - halfLon, p.lat - halfLat],
              [p.lon + halfLon, p.lat - halfLat],
              [p.lon + halfLon, p.lat + halfLat],
              [p.lon - halfLon, p.lat + halfLat],
              [p.lon - halfLon, p.lat - halfLat],
            ],
          ],
        },
      };
    }),
  };
}

export function densestSpot(points, size = 0.25) {
  const bins = new Map();
  let best = null;
  for (const p of points) {
    const key = `${Math.floor(p.lon / size)},${Math.floor(p.lat / size)}`;
    const entry = bins.get(key) ?? { n: 0, lon: 0, lat: 0 };
    entry.n += 1;
    entry.lon += p.lon;
    entry.lat += p.lat;
    bins.set(key, entry);
    if (!best || entry.n > best.n) best = entry;
  }
  return best ? { lon: best.lon / best.n, lat: best.lat / best.n } : null;
}
