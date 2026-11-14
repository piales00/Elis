import { FIRST_YEAR, LAST_YEAR } from "../config.js";

export function monthIndex(year, month) {
  return (year - FIRST_YEAR) * 12 + (month - 1);
}

export function fromIndex(index) {
  return { year: FIRST_YEAR + Math.floor(index / 12), month: (index % 12) + 1 };
}

export const MAX_INDEX = monthIndex(LAST_YEAR, 12);

export function stepPeriod(period, delta) {
  const next = Math.min(MAX_INDEX, Math.max(0, monthIndex(period.year, period.month) + delta));
  return fromIndex(next);
}

export function stateOf(rows) {
  if (!rows.length) return "unavailable";
  return rows.some((r) => !r.is_forecast) ? "observed" : "forecast";
}

export function periodState(series, year, month) {
  return stateOf(series.filter((r) => r.year === year && r.month === month));
}

export function yearState(series, year) {
  return stateOf(series.filter((r) => r.year === year));
}
