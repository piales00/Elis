import { useI18n } from "../i18n/I18nProvider.jsx";
import { slotState } from "../lib/series.js";
import { StateBadge } from "./TimeBar.jsx";

export default function SlotDetails({ slot, withReference = false }) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const state = slotState(slot.row);
  const row = slot.row;
  const lines = [];
  if (row) {
    lines.push([t("series.estimated"), num(row.estimated)]);
    lines.push([t("series.range"), `${num(row.est_low)} – ${num(row.est_high)}`]);
    if (withReference) {
      lines.push([t("series.hist_median"), row.hist_median === null || row.hist_median === undefined ? t("normal.refMissing") : num(row.hist_median)]);
      lines.push([t("series.anomaly"), row.anomaly_class ? t(`anomaly.${row.anomaly_class}`) : t("series.na")]);
    }
    lines.push([t("series.source"), t(`source.${row.source}`)]);
  }
  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-line bg-surface p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t("details.title")}</p>
      <p className="m-0 mt-1 text-xl font-semibold tabular-nums">
        {t(`month.${slot.month}`)} {slot.year}
      </p>
      <p className="m-0 mt-1 text-muted">
        <StateBadge state={state} />
      </p>
      {row ? (
        <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          {lines.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 text-right">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 mt-3 text-sm text-muted">{t("details.unavailable")}</p>
      )}
      {row?.is_forecast && <p className="m-0 mt-3 text-sm font-semibold text-forecast">{t("details.forecastNote")}</p>}
      <p className="m-0 mt-3 text-xs text-muted">{t("details.unit")}</p>
    </div>
  );
}
