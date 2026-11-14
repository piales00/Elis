import { lazy, Suspense, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { periodState } from "../lib/period.js";
import TimeBar from "./TimeBar.jsx";
const MapView = lazy(() => import("./MapView.jsx"));
import MapLegend from "./MapLegend.jsx";
import MapCellTable from "./MapCellTable.jsx";

const METRICS = ["estimated", "raw_modis", "raw_viirs"];

export default function MapSection({ regions, region, onRegionSelect, series, seriesLoading, period, onPeriodChange, map }) {
  const { t } = useI18n();
  const [metric, setMetric] = useState("estimated");

  const state = periodState(series, period.year, period.month);
  let message = null;
  let isError = false;
  if (seriesLoading || map.status === "loading") message = t("status.loading");
  else if (state === "forecast") message = t("map.status.forecast");
  else if (state === "unavailable") message = t("map.status.unavailable");
  else if (map.status === "nodata") message = t("map.status.nodata");
  else if (map.status === "error") {
    message = t("status.error", { message: map.error?.message ?? String(map.error) });
    isError = true;
  } else if (map.status === "ready" && map.cells.length === 0) message = t("map.status.empty");

  const cells = state === "observed" && map.status === "ready" ? map.cells : [];
  const periodLabel = `${t(`month.${period.month}`)} ${period.year}`;

  return (
    <div className="grid gap-4">
      <TimeBar period={period} series={series} loading={seriesLoading} onChange={onPeriodChange} />

      <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
        <legend className="float-left mr-3 p-0 text-sm text-muted">{t("map.metric.label")}</legend>
        {METRICS.map((m) => (
          <label
            key={m}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-est ${
              metric === m ? "border-fg bg-fg font-semibold text-bg" : "border-line bg-surface hover:bg-bg"
            }`}
          >
            <input type="radio" name="metric" value={m} checked={metric === m} onChange={() => setMetric(m)} className="sr-only" />
            {t(`metric.${m}`)}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative">
          <Suspense fallback={<p className="m-0 text-muted">{t("status.loading")}</p>}>
          <MapView
            regions={regions}
            cells={cells}
            metric={metric}
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
        <MapLegend metric={metric} />
      </div>

      <MapCellTable cells={cells} metric={metric} />
    </div>
  );
}
