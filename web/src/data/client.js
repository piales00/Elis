import { DATA_SOURCE, API_BASE, LIVE_FEED_URL } from "../config.js";
import seriesUrl from "../../mock/series.json?url";
import regionsUrl from "../../mock/regions.geojson?url";
import mapUrl from "../../mock/map-2024-09.json?url";
import methodologyUrl from "../../mock/methodology.json?url";

export const isMock = DATA_SOURCE === "mock";

export class NoDataError extends Error {}

class ApiDownError extends Error {}

export const API_TIMEOUT_MS = 7000;
export const API_RETRY_MS = 60000;
const PROBE_TIMEOUT_MS = 45000;
const STATIC_BASE = `${import.meta.env.BASE_URL}data/`;

export const staticUrl = (path) => `${STATIC_BASE}${path}`;

const DOWN_KEY = "fc.api.down";
const listeners = new Set();
const inflight = new Set();
let retryTimer = null;
let mode = recentlyDown() ? "fallback" : "api";
if (mode === "fallback") scheduleProbe(0);

function recentlyDown() {
  if (isMock) return false;
  try {
    const at = Number(sessionStorage.getItem(DOWN_KEY));
    return at > 0 && Date.now() - at < API_RETRY_MS;
  } catch {
    return false;
  }
}

function rememberDown(down) {
  try {
    if (down) sessionStorage.setItem(DOWN_KEY, String(Date.now()));
    else sessionStorage.removeItem(DOWN_KEY);
  } catch {}
}

export function getDataMode() {
  return mode;
}

export function subscribeDataMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  rememberDown(next === "fallback");
  if (next === "fallback") {
    for (const controller of inflight) controller.abort();
    scheduleProbe();
  } else {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  for (const listener of listeners) listener(mode);
}

async function timedFetch(url, ms) {
  const controller = new AbortController();
  inflight.add(controller);
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    inflight.delete(controller);
  }
}

function scheduleProbe(delay = API_RETRY_MS) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const body = response.ok ? await response.json() : null;
      if (body?.status === "ok") return setMode("api");
    } catch {}
    if (mode === "fallback") {
      rememberDown(true);
      scheduleProbe();
    }
  }, delay);
}

async function apiJson(path) {
  if (mode === "fallback") throw new ApiDownError("API unavailable");
  const url = `${API_BASE}${path}`;
  let response;
  try {
    response = await timedFetch(url, API_TIMEOUT_MS);
  } catch {
    setMode("fallback");
    throw new ApiDownError(`No response from ${url}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    setMode("fallback");
    throw new ApiDownError(`Invalid response from ${url}`);
  }
  if (response.ok) return body;
  if (response.status >= 500 && response.status !== 503) {
    setMode("fallback");
    throw new ApiDownError(`${response.status} from ${url}`);
  }
  if (!body || typeof body.detail === "undefined") {
    setMode("fallback");
    throw new ApiDownError(`${response.status} from ${url}`);
  }
  const error = new Error(`${response.status} ${response.statusText} (${url})`);
  error.status = response.status;
  error.detail = body.detail;
  throw error;
}

async function withFallback(path, fallback) {
  try {
    return await apiJson(path);
  } catch (error) {
    if (error instanceof ApiDownError) return fallback();
    throw error;
  }
}

const staticCache = new Map();

function staticJson(path) {
  if (!staticCache.has(path)) {
    const promise = getJson(staticUrl(path)).catch((error) => {
      staticCache.delete(path);
      throw error;
    });
    staticCache.set(path, promise);
  }
  return staticCache.get(path);
}

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

function httpError(status, detail) {
  const error = new Error(`${status} ${detail}`);
  error.status = status;
  error.detail = detail;
  return error;
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

function records(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  throw new Error("Invalid snapshot format");
}

export async function getRegions() {
  if (isMock) return normalizeRegions(await getJson(regionsUrl));
  return normalizeRegions(await withFallback("/regions", () => staticJson("regions.geojson")));
}

function filterSeries(rows, { region, from, to }) {
  return rows
    .filter(
      (row) =>
        row.region === region &&
        (from === undefined || from === null || (row.year ?? 0) >= from) &&
        (to === undefined || to === null || (row.year ?? 0) <= to),
    )
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.month ?? 0) - (b.month ?? 0));
}

export async function getSeries({ region, from, to }) {
  if (!region) throw new Error("region is required");
  if (isMock) return filterSeries(await getJson(seriesUrl), { region, from, to });
  return withFallback(`/series${query({ region, from, to })}`, async () => {
    if (from != null && to != null && from > to) throw httpError(422, "The start year cannot be later than the end year.");
    return filterSeries(records(await staticJson("series.json")), { region, from, to });
  });
}

function decodeMap(index, data) {
  const { lat0, lon0, step, width, alphabet } = index;
  const n = data.k.length;
  const counts = {};
  for (const column of index.columns) {
    const text = data[column];
    counts[column] = text === null || text === undefined ? null : text;
  }
  const cells = new Array(n);
  let key = 0;
  for (let i = 0; i < n; i++) {
    key += data.k[i];
    const latIdx = Math.floor(key / width);
    const lonIdx = key - latIdx * width;
    const cell = { lat: (lat0 + latIdx * step) / 100, lon: (lon0 + lonIdx * step) / 100 };
    for (const column of index.columns) {
      const text = counts[column];
      if (text === null) cell[column] = null;
      else {
        const c = text[i];
        cell[column] = c === "-" ? null : alphabet.indexOf(c);
      }
    }
    cell.estimated = data.e[i] / 100;
    cell.region = index.regions[data.r[i]];
    cells[i] = cell;
  }
  return cells;
}

async function staticMap({ year, month, region }) {
  if (!Number.isInteger(year) || year < 2000 || year > 2026 || !Number.isInteger(month) || month < 1 || month > 12)
    throw httpError(422, "year must be 2000-2026 and month 1-12.");
  const index = await staticJson("map/index.json");
  const key = `${year}-${String(month).padStart(2, "0")}`;
  if (!index.months.includes(key)) return [];
  const cells = decodeMap(index, await staticJson(`map/${key}.json`));
  const selected = !region || region === "peru" ? cells : cells.filter((cell) => cell.region === region);
  return selected.map(({ region: _r, ...cell }) => cell);
}

export async function getMap({ year, month, region }) {
  if (year === undefined || month === undefined) throw new Error("year and month are required");
  if (!isMock) {
    const apiRegion = region === "peru" ? undefined : region;
    return withFallback(`/map${query({ year, month, region: apiRegion })}`, () => staticMap({ year, month, region: apiRegion }));
  }
  if (year !== 2024 || month !== 9) throw new NoDataError(`No mock map for ${year}-${month}`);
  const cells = await getJson(mapUrl);
  if (!region || region === "peru") return cells;
  const regions = await getRegions();
  const feature = regions.features.find((f) => f.properties.id === region);
  if (!feature) return [];
  return cells.filter((cell) => inRing(cell.lon, cell.lat, feature.geometry.coordinates[0]));
}

function filterForecast(value, region) {
  if (!value || !Array.isArray(value.regions)) throw new Error("forecast.json has an invalid format.");
  if (!region) return value;
  const regions = value.regions.filter((row) => row.region === region);
  if (!regions.length) throw httpError(404, `No forecast entry for region '${region}'.`);
  const filtered = { ...value, regions };
  for (const key of ["backtest", "out_of_sample"]) {
    if (filtered[key] && Array.isArray(filtered[key].rows))
      filtered[key] = { ...filtered[key], rows: filtered[key].rows.filter((row) => row.region === region) };
  }
  return filtered;
}

export async function getForecast(region) {
  if (isMock) throw new NoDataError("The season outlook is only available with the API");
  return withFallback(`/forecast${query({ region })}`, async () => filterForecast(await staticJson("forecast.json"), region));
}

function filterMethodology(data, region) {
  if (!region) return data;
  const filtered = { ...data };
  for (const key of ["detection", "validation"]) {
    if (Array.isArray(filtered[key])) filtered[key] = filtered[key].filter((row) => row.region === region);
  }
  return filtered;
}

export async function getMethodology(region) {
  if (isMock) return filterMethodology(await getJson(methodologyUrl), region);
  return withFallback(`/methodology${query({ region })}`, async () => filterMethodology(await staticJson("methodology.json"), region));
}

export function applyContinuity(value, { region, shutdown } = {}) {
  if (!value || !Array.isArray(value.rows) || !value.metrics || typeof value.metrics !== "object")
    throw new Error("continuity.json has an invalid format.");
  const result = { ...value };
  if (region !== undefined && region !== null) {
    if (!(value.regions ?? []).includes(region)) throw httpError(404, `No continuity entry for region '${region}'.`);
    result.rows = value.rows.filter((row) => row.region === region);
    result.metrics = Object.fromEntries(
      Object.entries(value.metrics).map(([key, rows]) => [key, Array.isArray(rows) ? rows.filter((row) => row.region === region) : rows]),
    );
  }
  if (shutdown !== undefined && shutdown !== null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(shutdown)) throw httpError(422, "The shutdown month must use YYYY-MM.");
    const [first, last] = value.period ?? [null, null];
    if (first === null || !(first < shutdown && shutdown <= last))
      throw httpError(422, `The shutdown month must be after ${first} and no later than ${last}.`);
    result.rows = result.rows.map((row) => {
      const after = row.month >= shutdown;
      return {
        ...row,
        modis_scale: after ? row.aqua_emulated : row.aqua_observed,
        modis_scale_low: after ? row.aqua_emulated_low : row.aqua_observed,
        modis_scale_high: after ? row.aqua_emulated_high : row.aqua_observed,
        modis_scale_source: after ? "aqua_emulated" : "aqua_observed",
      };
    });
    result.scenario = { ...(value.scenario ?? {}), shutdown };
  }
  return result;
}

export async function getContinuity({ region, shutdown } = {}) {
  if (isMock) throw new NoDataError("Continuity is only available with the API");
  return withFallback(`/continuity${query({ region, shutdown })}`, async () =>
    applyContinuity(await staticJson("continuity.json"), { region, shutdown }),
  );
}

async function staticLive() {
  const [scoreboard, latest] = await Promise.all([staticJson("live/scoreboard.json"), staticJson("live/latest_prediction.json")]);
  if (!scoreboard || !Array.isArray(scoreboard.rows)) throw new NoDataError("No live scoreboard yet");
  return { scoreboard, latest_prediction: latest ?? null };
}

const FEED_LOOKBACK_DAYS = 5;

async function feedJson(path) {
  const response = await fetch(`${LIVE_FEED_URL}/${path}`, { cache: "no-cache", signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  if (!response.ok) throw httpError(response.status, `${path} not in the live feed`);
  return response.json();
}

function shiftDay(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function feedLive() {
  const scoreboard = await feedJson("scoreboard.json");
  if (!scoreboard || !Array.isArray(scoreboard.rows)) throw new Error("Invalid live feed scoreboard");
  const dates = scoreboard.rows.map((row) => row.date).filter(Boolean).sort();
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [];
  if (dates.length) candidates.push(shiftDay(dates.at(-1), 1), dates.at(-1));
  for (let i = 1; i <= FEED_LOOKBACK_DAYS; i++) candidates.push(shiftDay(today, -i));
  const tried = new Set();
  for (const date of candidates.sort().reverse()) {
    if (tried.has(date) || date >= today) continue;
    tried.add(date);
    try {
      return { scoreboard, latest_prediction: await feedJson(`predictions/${date}.json`) };
    } catch {}
  }
  return { scoreboard, latest_prediction: null };
}

export async function getLive() {
  if (isMock) throw new NoDataError("The live check is only available with the API");
  try {
    return await feedLive();
  } catch {}
  try {
    return await withFallback("/live", staticLive);
  } catch (error) {
    if (error.status === 503 || error.status === 404) throw new NoDataError("No live scoreboard yet");
    throw error;
  }
}
