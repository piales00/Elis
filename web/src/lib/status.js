import { findRow } from "./series.js";

function ym(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function periodInfo(periods, year, month) {
  const key = ym(year, month);
  return (periods ?? []).find((p) => p.from <= key && key <= p.to) ?? null;
}

export function periodStatus(series, periods, year, month) {
  const row = findRow(series, year, month);
  if (!row) return { kind: "unavailable", row: null, info: null };
  if (row.is_forecast) return { kind: "forecast", row, info: null };
  const info = periodInfo(periods, year, month);
  if (info?.partial_through) return { kind: "partial", row, info };
  if (info?.confidence === "provisional") return { kind: "provisional", row, info };
  if (info?.confidence === "low") return { kind: "low", row, info };
  return { kind: "observed", row, info };
}

export const STATUS_TONE = {
  observed: "border-line-strong text-fg",
  provisional: "border-amber text-amber",
  partial: "border-amber text-amber",
  low: "border-dashed border-muted text-muted",
  forecast: "border-dashed border-forecast text-forecast",
  unavailable: "border-dotted border-line-strong text-muted",
};
