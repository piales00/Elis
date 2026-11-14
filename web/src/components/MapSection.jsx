import { lazy, Suspense, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { periodState } from "../lib/period.js";
import { computeBreaks } from "../lib/mapStyle.js";
import { beforeCoverage, DEFAULT_SUB, gapNoteKey, sensorFor } from "../content/sensors.js";
import TimeBar from "./TimeBar.jsx";
import MapLegend from "./MapLegend.jsx";
import MapCellTable from "./MapCellTable.jsx";
import { isMock } from "../data/client.js";
import SensorSelector from "./SensorSelector.jsx";
import ImageryControls from "./imagery/ImageryControls.jsx";
import ImageryLegend from "./imagery/ImageryLegend.jsx";
import { useImageryView } from "./imagery/useImageryView.js";
import { FIRST_YEAR, LAST_YEAR } from "../config.js";

const MapView = lazy(() => import("./MapView.jsx"));
const NONE = [];

export default function MapSection({ regions, region, onRegionSelect, series, seriesLoading, period, onPeriodChange, map }) {
  const { t } = useI18n();
  const [group, setGroup] = useState("estimated");
  const [sub, setSub] = useState("all");
  const img = useImageryView({ period, onPeriodChange, regions, region });
  const regionLabel = t(`region.${region}`);

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
  if (img.view === "imagery") {
    message = img.message;
    isError = img.isError;
  }

  return (
    <div className="grid gap-4">
      <TimeBar period={period} series={series} loading={seriesLoading} onChange={onPeriodChange} />

      {gapKey && (
        <p role="note" className="card-soft m-0 border-dashed border-forecast p-3 text-sm">
          {t(gapKey)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="relative">
          <Suspense fallback={<p className="m-0 text-muted">{t("status.loading")}</p>}>
            <MapView
              regions={regions}
              cells={cells}
              metric={metric}
              breaks={breaks}
              region={region}
              onRegionSelect={onRegionSelect}
              onCellSelect={img.selectCell}
              imagery={img.imagery}
              ariaLabel={t("map.aria", { period: periodLabel })}
            />
          </Suspense>
          {message && (
            <p
              role={isError ? "alert" : "status"}
              className={`absolute left-1/2 top-3 m-0 w-[min(34rem,calc(100%-11rem))] -translate-x-1/2 rounded-xl border bg-bg/90 px-3 py-2 text-center text-sm ${
                isError ? "border-danger font-semibold text-danger" : "border-line"
              }`}
            >
              {message}
            </p>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-5rem)]">
            {img.view === "imagery" ? (
              <ImageryLegend dateLabel={img.dateLabel} detections={img.detections} regionLabel={regionLabel} />
            ) : (
              <MapLegend metric={metric} breaks={breaks} />
            )}
          </div>
        </div>
        <div className="grid gap-4">
          <ImageryControls
            view={img.view}
            onViewChange={img.setView}
            base={img.base}
            onBaseChange={img.setBase}
            date={img.date}
            onDateChange={img.setDate}
            raster={img.raster}
            satellites={img.satellites}
            onSatelliteChange={img.setSatellite}
            minYear={FIRST_YEAR}
            maxYear={LAST_YEAR}
            onTrueScale={img.trueScale}
          />
          {img.view === "cells" && <SensorSelector
            group={group}
            sub={sub}
            onGroupChange={(g) => {
              setGroup(g);
              setSub(DEFAULT_SUB[g]);
            }}
            onSubChange={setSub}
          />}
          <div className="card-soft p-4 text-xs text-muted">
            <ul className="m-0 grid list-none gap-2 p-0">
              <li className="flex items-center gap-3">
                <svg width="26" height="10" aria-hidden="true">
                  <line x1="1" x2="25" y1="5" y2="5" strokeWidth="1.2" strokeDasharray="3 3" style={{ stroke: "var(--muted)" }} />
                </svg>
                <span>{t("map.legend.region")}</span>
              </li>
              <li className="flex items-center gap-3">
                <svg width="26" height="10" aria-hidden="true">
                  <line x1="1" x2="25" y1="5" y2="5" strokeWidth="1.6" style={{ stroke: "var(--sat)", opacity: 0.7 }} />
                </svg>
                <span>{t("map.legend.selected")}</span>
              </li>
            </ul>
            <p className="m-0 mt-3">{t(isMock ? "map.boundaries.mock" : "map.boundaries.api")}</p>
          </div>
        </div>
      </div>

      <MapCellTable cells={cells} metric={metric} />
    </div>
  );
}
