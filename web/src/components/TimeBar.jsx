import { FIRST_YEAR, LAST_YEAR } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { periodState, stepPeriod, yearState } from "../lib/period.js";

const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const stripClass = {
  observed: "bg-est",
  forecast: "border border-dashed border-forecast bg-transparent",
  unavailable: "border border-dotted border-line bg-transparent",
};
const monthClass = {
  observed: "border-solid border-line",
  forecast: "border-dashed border-forecast text-forecast",
  unavailable: "border-dotted border-line text-none",
};
const glyph = { observed: "●", forecast: "◐", unavailable: "○" };

export function StateBadge({ state }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true">{glyph[state]}</span>
      {t(`availability.${state}`)}
    </span>
  );
}

export default function TimeBar({ period, series, loading, onChange }) {
  const { t } = useI18n();
  const current = periodState(series, period.year, period.month);
  const label = `${t(`month.${period.month}`)} ${period.year}`;
  const stepButton = "rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-40";

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold">{t("time.title")}</h3>
        <div className="flex items-center gap-2">
          <button type="button" className={stepButton} aria-label={t("time.prev")} onClick={() => onChange(stepPeriod(period, -1))}>
            ◀
          </button>
          <span className="min-w-[8.5rem] text-center text-lg font-semibold tabular-nums" aria-live="polite">
            {label}
          </span>
          <button type="button" className={stepButton} aria-label={t("time.next")} onClick={() => onChange(stepPeriod(period, 1))}>
            ▶
          </button>
        </div>
        <div aria-live="polite">{loading ? null : <StateBadge state={current} />}</div>
      </div>

      <div className="mt-4">
        <label htmlFor="year-range" className="text-sm text-muted">
          {t("time.year")}
        </label>
        <input
          id="year-range"
          type="range"
          min={FIRST_YEAR}
          max={LAST_YEAR}
          step={1}
          value={period.year}
          onChange={(e) => onChange({ year: Number(e.target.value), month: period.month })}
          aria-valuetext={String(period.year)}
          className="block w-full accent-[var(--c-est)]"
        />
        <ul
          aria-label={t("time.strip")}
          className="m-0 mt-1 grid list-none gap-px p-0"
          style={{ gridTemplateColumns: `repeat(${YEARS.length}, minmax(0, 1fr))` }}
        >
          {YEARS.map((y) => {
            const state = loading ? "unavailable" : yearState(series, y);
            return (
              <li key={y} className="h-2.5">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`${y}: ${t(`availability.${state}`)}`}
                  onClick={() => onChange({ year: y, month: period.month })}
                  className={`block h-full w-full rounded-[2px] ${stripClass[state]} ${y === period.year ? "outline outline-2 outline-offset-1 outline-accent" : ""}`}
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
          <span>{FIRST_YEAR}</span>
          <span>{LAST_YEAR}</span>
        </div>
      </div>

      <div className="mt-4">
        <p className="m-0 mb-1 text-sm text-muted">{t("time.month")}</p>
        <ul className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 sm:grid-cols-12">
          {MONTHS.map((m) => {
            const state = loading ? "unavailable" : periodState(series, period.year, m);
            const selected = m === period.month;
            return (
              <li key={m}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${t(`month.${m}`)} ${period.year}: ${t(`availability.${state}`)}`}
                  onClick={() => onChange({ year: period.year, month: m })}
                  className={`w-full rounded-md border px-1 py-1.5 text-sm ${monthClass[state]} ${
                    selected ? "bg-fg font-semibold !text-bg" : "bg-surface hover:bg-bg"
                  }`}
                >
                  <span aria-hidden="true" className="mr-1 text-[10px]">
                    {glyph[state]}
                  </span>
                  {t(`month.${m}`)}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-muted">
        {["observed", "forecast", "unavailable"].map((s) => (
          <li key={s}>
            <StateBadge state={s} />
          </li>
        ))}
        {period.year === LAST_YEAR && (
          <li className="text-sm font-semibold text-accent">{t("time.partialTag")}</li>
        )}
      </ul>
      {period.year === LAST_YEAR && <p className="m-0 mt-1 text-sm text-muted">{t("time.partial", { year: LAST_YEAR })}</p>}
    </div>
  );
}
