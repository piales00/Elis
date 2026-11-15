import { FIRST_YEAR, LAST_YEAR } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export default function YearStepper({ year, onChange }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t("year.label")}>
      <button type="button" className="btn-icon" disabled={year <= FIRST_YEAR} aria-label={t("year.prev")} onClick={() => onChange(year - 1)}>
        ◀
      </button>
      <span className="min-w-[4.5rem] text-center font-head text-xl font-extrabold tabular-nums" aria-live="polite">
        {year}
      </span>
      <button type="button" className="btn-icon" disabled={year >= LAST_YEAR} aria-label={t("year.next")} onClick={() => onChange(year + 1)}>
        ▶
      </button>
    </div>
  );
}
