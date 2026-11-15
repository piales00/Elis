import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { periodState } from "../lib/period.js";
import { computeBreaks } from "../lib/mapStyle.js";
import { beforeCoverage, gapNoteKey, sensorFor } from "../content/sensors.js";

const NONE = [];

export function useCellView({ series, seriesLoading, period, map, group, sub }) {
  const { t } = useI18n();
  const sensor = sensorFor(group, sub);
  const metric = sensor.field;
  const state = periodState(series, period.year, period.month);
  const noCoverage = beforeCoverage(sensor, period.year, period.month);
  const ready = map.status === "ready";
  const fieldMissing = ready && map.cells.length > 0 && !(metric in map.cells[0]);
  const allNull = ready && map.cells.length > 0 && !fieldMissing && !map.cells.some((c) => c[metric] !== null && c[metric] !== undefined);
  const sensorName = t(sensor.id === "all" ? `sensor.group.${group}` : sensor.labelKey);
  const since = sensor.since ? (sensor.since.month === 1 ? String(sensor.since.year) : `${t(`month.${sensor.since.month}`)} ${sensor.since.year}`) : "";

  let message = null;
  let isError = false;
  if (seriesLoading || map.status === "loading") message = t("status.loading");
  else if (state === "forecast") message = null;
  else if (state === "unavailable") message = t("map.status.unavailable");
  else if (map.status === "nodata") message = t("map.status.nodata");
  else if (map.status === "error") {
    message = t("status.error", { message: map.error?.message ?? String(map.error) });
    isError = true;
  } else if (noCoverage) message = t("map.status.noCoverage", { sensor: sensorName, since });
  else if (ready && map.cells.length === 0) message = t("map.status.empty");
  else if (fieldMissing) message = t("map.status.fieldMissing", { sensor: sensorName });
  else if (allNull) message = t("map.status.noCoverage", { sensor: sensorName, since });

  const cells = state === "observed" && ready && !noCoverage && !fieldMissing && !allNull ? map.cells : NONE;
  const breaks = useMemo(() => computeBreaks(cells, metric), [cells, metric]);

  return {
    sensor,
    metric,
    state,
    cells,
    breaks,
    message,
    isError,
    loading: seriesLoading || map.status === "loading",
    gapKey: gapNoteKey(group, sensor, period.year, period.month),
  };
}
