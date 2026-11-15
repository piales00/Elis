import { useI18n } from "../../i18n/I18nProvider.jsx";
import { ClassBadge } from "../SlotDetails.jsx";

function coord(t, value, pos, neg) {
  return `${Math.abs(value).toFixed(2)}°${t(`coord.${value < 0 ? neg : pos}`)}`;
}

export default function RegionPanel({ regionLabel, periodLabel, series, period, cell, onClearCell, detections, dateLabel, showingImagery, onShowImagery }) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const row = series.find((r) => r.year === period.year && r.month === period.month && !r.is_forecast) ?? null;
  const forecasts = series.filter((r) => r.is_forecast).slice(0, 3);
  const dailyReady = detections.status === "ready";
  const ratio = dailyReady && detections.modis.length > 0 ? detections.viirs.length / detections.modis.length : null;

  return (
    <section aria-labelledby="region-panel-title" className="card grid gap-3 p-4">
      <div>
        <p className="eyebrow !text-muted">{t(cell ? "panel.cellEyebrow" : "panel.eyebrow")}</p>
        <h3 id="region-panel-title" className="m-0 mt-1 font-head text-xl font-extrabold">
          {cell ? t("map.popup.cell", { lat: coord(t, cell.lat, "N", "S"), lon: coord(t, cell.lon, "E", "W") }) : regionLabel}
        </h3>
        <p className="m-0 text-sm text-muted">{periodLabel}</p>
      </div>

      {cell ? (
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm tabular-nums">
          <dt className="text-muted">{t("metric.raw_modis")}</dt>
          <dd className="m-0 text-right">{num(cell.raw_modis)}</dd>
          <dt className="text-muted">{t("metric.raw_viirs")}</dt>
          <dd className="m-0 text-right">{num(cell.raw_viirs)}</dd>
          <dt className="font-semibold">{t("metric.estimated")}</dt>
          <dd className="m-0 text-right font-semibold text-sat">{num(cell.estimated)}</dd>
          <dd className="col-span-2 m-0 text-xs text-muted">{t("panel.cellRange")}</dd>
        </dl>
      ) : row ? (
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-line pt-3 text-sm tabular-nums">
          <dt className="text-muted">{t("series.raw_modis")}</dt>
          <dd className="m-0 text-right">{num(row.raw_modis)}</dd>
          <dt className="text-muted">{t("series.raw_viirs")}</dt>
          <dd className="m-0 text-right">{num(row.raw_viirs)}</dd>
          <dt className="font-semibold">{t("panel.harmonized")}</dt>
          <dd className="m-0 text-right font-head text-lg font-extrabold text-sat">{num(row.estimated)}</dd>
          <dt className="text-muted">{t("series.range")}</dt>
          <dd className="m-0 text-right">
            {num(row.est_low)} – {num(row.est_high)}
          </dd>
          <dt className="text-muted">{t("series.anomaly")}</dt>
          <dd className="m-0 text-right">
            <ClassBadge value={row.anomaly_class} />
          </dd>
        </dl>
      ) : (
        <p className="m-0 border-t border-line pt-3 text-sm text-muted">{t("details.unavailable")}</p>
      )}

      {!cell && (
        <div className="border-t border-line pt-3 text-sm">
          <p className="m-0 mb-1 text-xs font-bold uppercase tracking-[0.12em] text-forecast">{t("panel.forecast")}</p>
          {forecasts.length ? (
            <ul className="m-0 grid list-none gap-1 p-0 tabular-nums">
              {forecasts.map((f) => (
                <li key={`${f.year}-${f.month}`} className="flex justify-between gap-3">
                  <span>
                    {t(`month.${f.month}`)} {f.year}
                  </span>
                  <span>
                    {num(f.estimated)} <span className="text-muted">({num(f.est_low)} – {num(f.est_high)})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-muted">{t("panel.noForecast")}</p>
          )}
        </div>
      )}

      {showingImagery && (
        <div className="border-t border-line pt-3 text-sm">
          <p className="m-0 mb-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">{t("panel.daily", { date: dateLabel, region: regionLabel })}</p>
          {detections.status === "error" ? (
            <p role="alert" className="m-0 text-danger">
              {t("status.error", { message: detections.error?.message ?? "" })}
            </p>
          ) : (
            <>
              <p className="m-0 tabular-nums">
                {t("panel.dailyCounts", {
                  modis: detections.layers.modis ? (dailyReady ? formatNumber(detections.modis.length) : "…") : t("series.na"),
                  viirs: detections.layers.viirs ? (dailyReady ? formatNumber(detections.viirs.length) : "…") : t("series.na"),
                })}
              </p>
              {ratio !== null && detections.layers.viirs && (
                <p className="m-0 font-semibold text-amber">{t("panel.dailyRatio", { ratio: formatNumber(ratio, { maximumFractionDigits: 1 }) })}</p>
              )}
              <p className="m-0 mt-1 text-xs text-muted">{t("panel.dailyNote")}</p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!showingImagery && (
          <button type="button" className="btn-icon font-medium" onClick={onShowImagery}>
            {t("panel.showImagery")}
          </button>
        )}
        {cell && (
          <button type="button" className="btn-icon font-medium" onClick={onClearCell}>
            {t("panel.backToRegion")}
          </button>
        )}
      </div>
      <p className="m-0 text-xs text-muted">{t("details.unit")}</p>
    </section>
  );
}
