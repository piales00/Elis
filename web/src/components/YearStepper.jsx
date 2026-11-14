import { FIRST_YEAR, LAST_YEAR } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export default function YearStepper({ year, onChange }) {
  const { t } = useI18n();
  const btn = "rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-bg disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t("year.label")}>
      <button type="button" className={btn} disabled={year <= FIRST_YEAR} aria-label={t("year.prev")} onClick={() => onChange(year - 1)}>
        ◀
      </button>
      <span className="min-w-[4.5rem] text-center text-lg font-semibold tabular-nums" aria-live="polite">
        {year}
      </span>
      <button type="button" className={btn} disabled={year >= LAST_YEAR} aria-label={t("year.next")} onClick={() => onChange(year + 1)}>
        ▶
      </button>
    </div>
  );
}
