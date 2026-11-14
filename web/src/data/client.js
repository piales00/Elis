import { DATA_SOURCE, API_BASE } from "../config.js";
import seriesUrl from "../../mock/series.json?url";
import regionsUrl from "../../mock/regions.geojson?url";
import mapUrl from "../../mock/map-2024-09.json?url";
import methodologyUrl from "../../mock/methodology.json?url";

export const isMock = DATA_SOURCE === "mock";

export class NoDataError extends Error {}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
  return response.json();
}

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const LEVEL_ALIASES = { pais: "country", departamento: "department" };

function normalizeRegions(geo) {
  return {
    ...geo,
    features: geo.features.map((f) => ({
      ...f,
      properties: { ...f.properties, level: LEVEL_ALIASES[f.properties.level] ?? f.properties.level },
    })),
  };
}

export async function getRegions() {
  return normalizeRegions(await getJson(isMock ? regionsUrl : `${API_BASE}/regions`));
}

export async function getSeries({ region, from, to }) {
  if (!region) throw new Error("region is required");
  if (!isMock) return getJson(`${API_BASE}/series${query({ region, from, to })}`);
  const rows = await getJson(seriesUrl);
  return rows.filter(
    (row) =>
      row.region === region &&
      (from === undefined || row.year >= from) &&
      (to === undefined || row.year <= to),
  );
}

export async function getMap({ year, month, region }) {
  if (year === undefined || month === undefined) throw new Error("year and month are required");
  if (!isMock) return getJson(`${API_BASE}/map${query({ year, month, region: region === "peru" ? undefined : region })}`);
  if (year !== 2024 || month !== 9) throw new NoDataError(`No mock map for ${year}-${month}`);
  const cells = await getJson(mapUrl);
  if (!region || region === "peru") return cells;
  const regions = await getRegions();
  const feature = regions.features.find((f) => f.properties.id === region);
  if (!feature) return [];
  return cells.filter((cell) => inRing(cell.lon, cell.lat, feature.geometry.coordinates[0]));
}

export async function getMethodology(region) {
  if (!isMock) return getJson(`${API_BASE}/methodology${query({ region })}`);
  const data = await getJson(methodologyUrl);
  if (!region) return data;
  return {
    ...data,
    detection: data.detection.filter((row) => row.region === region),
    validation: data.validation.filter((row) => row.region === region),
  };
}
