import { FIRST_YEAR, LAST_YEAR } from "../config.js";

export function niceMax(value) {
  if (!(value > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function slotState(row) {
  if (!row) return "unavailable";
  return row.is_forecast ? "forecast" : "observed";
}

export function findRow(series, year, month) {
  return series.find((r) => r.year === year && r.month === month) ?? null;
}

export function monthSlots(series, year) {
  return Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1, row: findRow(series, year, i + 1) }));
}

export function seriesMax(series, keys) {
  let max = 0;
  for (const row of series) {
    for (const key of keys) {
      if (typeof row[key] === "number" && row[key] > max) max = row[key];
    }
  }
  return niceMax(max);
}

export function clampYear(year) {
  return Math.min(LAST_YEAR, Math.max(FIRST_YEAR, year));
}
