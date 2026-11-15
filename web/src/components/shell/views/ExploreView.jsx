import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { SENSORS } from "../../../content/sensors.js";
import { ClassBadge } from "../../SlotDetails.jsx";
import ImageryControls from "../../imagery/ImageryControls.jsx";
import { FIRST_YEAR, LAST_YEAR } from "../../../config.js";
import StatusChip from "../StatusChip.jsx";

function coord(t, value, pos, neg) {
  return `${Math.abs(value).toFixed(2)}°${t(`coord.${value < 0 ? neg : pos}`)}`;
}

function Row({ label, value, strong, color }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="flex items-center gap-2 text-muted">
        {color && <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: color }} />}
        {label}
      </dt>
      <dd className={`m-0 tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

export function Figure({ row, status, regionLabel, onOpenOutlook }) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v, { maximumFractionDigits: 0 }));
  if (!row) {
    return (
      <div className="fc-empty">
        <p className="m-0 font-semibold">{t("explore.empty.title")}</p>
        <p className="m-0 mt-1 text-sm text-muted">{t("explore.empty.text")}</p>
      </div>
    );
  }
  const forecast = row.is_forecast;
  return (
    <div className={forecast ? "fc-forecast-block" : ""}>
      {forecast && <p className="m-0 mb-2 text-xs font-bold text-forecast">{t("explore.forecastTag")}</p>}
      <p className="m-0 text-xs text-muted">{t(forecast ? "explore.forecastFigure" : "explore.figure", { region: regionLabel })}</p>
      <p className={`m-0 font-head text-[2.5rem] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums ${forecast ? "text-forecast" : "text-est"}`}>{num(row.estimated)}</p>
      <p className="m-0 text-sm">
        <span className="text-muted">{t("unit.long")}</span>
      </p>
      <p className="m-0 mt-2 text-sm tabular-nums">
        <span className="text-muted">{t("explore.range")}</span> <span className="font-semibold">{num(row.est_low)} – {num(row.est_high)}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ClassBadge value={row.anomaly_class} />
        {row.hist_median !== null && row.hist_median !== undefined && (
          <span className="text-xs text-muted tabular-nums">{t("explore.vsMedian", { value: num(row.hist_median) })}</span>
        )}
      </div>
      {status && status.kind !== "observed" && status.kind !== "forecast" && (
        <p className="m-0 mt-3 text-xs leading-relaxed text-muted">
          <StatusChip status={status} className="mr-1.5" />
          {t(`status.note.${status.kind}`)}
        </p>
      )}
      {forecast && (
        <>
          <p className="m-0 mt-3 text-xs leading-relaxed text-muted">{t("explore.forecastNote")}</p>
          {onOpenOutlook && (
            <button type="button" className="fc-btn mt-3" onClick={onOpenOutlook}>
              {t("explore.openOutlook")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function ExploreView({
  regionLabel,
  period,
  status,
  img,
  group,
  sub,
  onSubChange,
  cellView,
  onOpenOutlook,
  onOpenCells,
}) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const row = status.row;
  const cell = img.cell;
  const imagery = img.view === "imagery";
  const detections = img.detections;
  const dailyReady = detections.status === "ready";
  const ratio = dailyReady && detections.modis.length > 0 ? detections.viirs.length / detections.modis.length : null;
  const subs = group === "estimated" ? null : SENSORS[group];

  return (
    <div className="grid gap-5">
      {cell ? (
        <section aria-labelledby="cell-title" className="grid gap-2">
          <h3 id="cell-title" className="m-0 text-base font-semibold">
            {t("map.popup.cell", { lat: coord(t, cell.lat, "N", "S"), lon: coord(t, cell.lon, "E", "W") })}
          </h3>
          <dl className="m-0 divide-y divide-line">
            <Row label={t("metric.estimated")} value={num(cell.estimated)} strong color="var(--c-est)" />
            <Row label={t("metric.raw_modis")} value={num(cell.raw_modis)} color="var(--c-modis)" />
            <Row label={t("metric.raw_viirs")} value={num(cell.raw_viirs)} color="var(--c-viirs)" />
          </dl>
          <p className="m-0 text-xs text-muted">{t("panel.cellRange")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="fc-btn" onClick={img.clearCell}>
              {t("panel.backToRegion")}
            </button>
            {!imagery && (
              <button type="button" className="fc-btn" onClick={img.showImagery}>
                {t("panel.showImagery")}
              </button>
            )}
          </div>
        </section>
      ) : (
        <Figure row={row} status={status} regionLabel={regionLabel} onOpenOutlook={onOpenOutlook} />
      )}

      {!cell && row && !row.is_forecast && (
        <section aria-labelledby="sensors-title">
          <h3 id="sensors-title" className="fc-h">
            {t("explore.sensors")}
          </h3>
          <dl className="m-0 divide-y divide-line">
            <Row label={t("series.raw_modis")} value={num(row.raw_modis)} color="var(--c-modis)" />
            <Row label={t("series.raw_viirs")} value={num(row.raw_viirs)} color="var(--c-viirs)" />
            <Row label={t("series.raw_detections")} value={num(row.raw_detections)} color="var(--c-raw)" />
          </dl>
          <p className="m-0 mt-1 text-xs text-muted">{t("explore.sensorsNote")}</p>
        </section>
      )}

      {imagery && (
        <section aria-labelledby="daily-title" className="grid gap-3">
          <h3 id="daily-title" className="fc-h">
            {t("panel.daily", { date: img.dateLabel, region: regionLabel })}
          </h3>
          {detections.status === "error" ? (
            <p role="alert" className="m-0 text-sm text-danger">
              {t("status.error", { message: detections.error?.message ?? "" })}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {["modis", "viirs"].map((s) => (
                <div key={s} className="rounded-lg bg-surface-2 px-3 py-2">
                  <p className="m-0 text-xs text-muted">{t(`imagery.legend.${s}`)}</p>
                  <p className="m-0 font-head text-xl font-extrabold tabular-nums">
                    {detections.layers[s] ? (dailyReady ? formatNumber(detections[s].length) : "…") : t("series.na")}
                  </p>
                </div>
              ))}
            </div>
          )}
          {ratio !== null && detections.layers.viirs && (
            <p className="m-0 text-sm font-semibold text-amber">{t("panel.dailyRatio", { ratio: formatNumber(ratio, { maximumFractionDigits: 1 }) })}</p>
          )}
          <p className="m-0 text-xs text-muted">{t("panel.dailyNote")}</p>
          <ImageryControls
            compact
            view={img.view}
            onViewChange={img.setView}
            base={img.base}
            onBaseChange={img.setBase}
            date={img.date}
            onDateChange={img.setDate}
            raster={img.raster}
            satellites={img.satellites}
            onSatelliteChange={img.setSatellite}
            heat={img.heat}
            onHeatChange={img.setHeat}
            minYear={FIRST_YEAR}
            maxYear={LAST_YEAR}
            onTrueScale={img.trueScale}
          />
        </section>
      )}

      {!imagery && !cell && (
        <>
          {subs && (
            <fieldset className="m-0 border-0 p-0">
              <legend className="fc-h">{t(`sensor.sub.${group}`)}</legend>
              <div className="flex flex-wrap gap-1.5">
                {subs.map((s) => (
                  <label key={s.id} className={`chip ${sub === s.id ? "chip-on" : ""}`}>
                    <input type="radio" name="explore-sub" value={s.id} checked={sub === s.id} onChange={() => onSubChange(s.id)} className="sr-only" />
                    {t(s.labelKey)}
                  </label>
                ))}
              </div>
              <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{t(`sensor.note.${group}`)}</p>
            </fieldset>
          )}
          {cellView.gapKey && <p className="fc-note m-0">{t(cellView.gapKey)}</p>}
          {row && !row.is_forecast && (
            <button type="button" className="fc-btn justify-self-start" onClick={img.showImagery}>
              {t("explore.toImagery", { date: img.dateLabel })}
            </button>
          )}
          {cellView.cells.length > 0 && (
            <button type="button" className="fc-link justify-self-start text-sm" onClick={onOpenCells}>
              {t("explore.openCells", { n: formatNumber(cellView.cells.length) })} →
            </button>
          )}
        </>
      )}
      <p className="m-0 text-xs text-muted">{t("details.unit")}</p>
    </div>
  );
}
