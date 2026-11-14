import { lazy, Suspense, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { periodState } from "../lib/period.js";
import { computeBreaks } from "../lib/mapStyle.js";
import { beforeCoverage, DEFAULT_SUB, gapNoteKey, sensorFor } from "../content/sensors.js";
import TimeBar from "./TimeBar.jsx";
import MapLegend from "./MapLegend.jsx";
import MapCellTable from "./MapCellTable.jsx";
import SensorSelector from "./SensorSelector.jsx";

const MapView = lazy(() => import("./MapView.jsx"));
const NONE = [];

export default function MapSection({ regions, region, onRegionSelect, series, seriesLoading, period, onPeriodChange, map }) {
  const { t } = useI18n();
  const [group, setGroup] = useState("estimated");
  const [sub, setSub] = useState("all");

  const sensor = sensorFor(group, sub);
  const gapKey = gapNoteKey(group, sensor, period.year, period.month);
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
  else if (state === "forecast") message = t("map.status.forecast");
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
  const periodLabel = `${t(`month.${period.month}`)} ${period.year}`;

  return (
    <div className="grid gap-4">
      <TimeBar period={period} series={series} loading={seriesLoading} onChange={onPeriodChange} />

      <SensorSelector
        group={group}
        sub={sub}
        onGroupChange={(g) => {
          setGroup(g);
          setSub(DEFAULT_SUB[g]);
        }}
        onSubChange={setSub}
      />

      {gapKey && (
        <p role="note" className="m-0 rounded-lg border border-dashed border-forecast bg-surface p-3 text-sm">
          {t(gapKey)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative">
          <Suspense fallback={<p className="m-0 text-muted">{t("status.loading")}</p>}>
            <MapView
              regions={regions}
              cells={cells}
              metric={metric}
              breaks={breaks}
              region={region}
              onRegionSelect={onRegionSelect}
              ariaLabel={t("map.aria", { period: periodLabel })}
            />
          </Suspense>
          {message && (
            <p
              role={isError ? "alert" : "status"}
              className={`absolute inset-x-12 bottom-8 m-0 rounded-lg border bg-surface/95 px-3 py-2 text-center text-sm shadow ${
                isError ? "border-danger font-semibold text-danger" : "border-line"
              }`}
            >
              {message}
            </p>
          )}
        </div>
        <MapLegend metric={metric} breaks={breaks} />
      </div>

      <MapCellTable cells={cells} metric={metric} />
    </div>
  );
}
