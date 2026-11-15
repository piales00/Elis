import { useI18n } from "../i18n/I18nProvider.jsx";
import { slotState } from "../lib/series.js";
import { StateBadge } from "./TimeBar.jsx";

export const CLASS_GLYPH = { low: "↓", normal: "→", high: "↑", very_high: "⇈" };
const CLASS_TONE = {
  low: "border-sat text-sat",
  normal: "border-muted text-fg",
  high: "border-amber text-amber",
  very_high: "border-[var(--c-very-high)] text-[var(--c-very-high)]",
};

export function ClassBadge({ value }) {
  const { t } = useI18n();
  if (!value) return <span className="text-muted">{t("series.na")}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${CLASS_TONE[value] ?? "border-line"}`}>
      <span aria-hidden="true">{CLASS_GLYPH[value]}</span>
      {t(`anomaly.${value}`)}
    </span>
  );
}

export default function SlotDetails({ slot, withReference = false }) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const state = slotState(slot.row);
  const row = slot.row;
  const hasRef = row && row.hist_median !== null && row.hist_median !== undefined;

  return (
    <aside role="status" aria-live="polite" className="self-start border-t border-line pt-5 @3xl:border-l @3xl:border-t-0 @3xl:pl-6 @3xl:pt-0">
      <p className="eyebrow !text-muted">{t("details.title")}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-head text-2xl font-extrabold tabular-nums">
          {t(`month.${slot.month}`)} {slot.year}
        </p>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-muted">
          <StateBadge state={state} />
        </span>
      </div>

      {row ? (
        <>
          <p className="m-0 mt-4 text-xs text-muted">{t("series.estimated")}</p>
          <p className="m-0 font-head text-3xl font-extrabold tabular-nums text-sat">{num(row.estimated)}</p>
          <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-line pt-3 text-sm tabular-nums">
            <dt className="text-muted">{t("series.range")}</dt>
            <dd className="m-0 text-right">
              {num(row.est_low)} – {num(row.est_high)}
            </dd>
            {withReference && (
              <>
                <dt className="text-muted">{t("series.hist_median")}</dt>
                <dd className="m-0 text-right text-amber">{hasRef ? num(row.hist_median) : t("normal.refMissing")}</dd>
                <dt className="text-muted">{t("series.anomaly")}</dt>
                <dd className="m-0 text-right">
                  <ClassBadge value={row.anomaly_class} />
                </dd>
              </>
            )}
            <dt className="text-muted">{t("series.source")}</dt>
            <dd className="m-0 text-right">{t(`source.${row.source}`)}</dd>
          </dl>
        </>
      ) : (
        <p className="m-0 mt-4 text-sm text-muted">{t("details.unavailable")}</p>
      )}
      {row?.is_forecast && (
        <p className="m-0 mt-3 rounded-lg border border-dashed border-forecast p-2 text-sm font-semibold text-forecast">{t("details.forecastNote")}</p>
      )}
      <p className="m-0 mt-4 text-xs text-muted">{t("details.unit")}</p>
    </aside>
  );
}
