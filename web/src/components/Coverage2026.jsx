import { useI18n } from "../i18n/I18nProvider.jsx";

const itemClass = {
  observed: "border-accent",
  forecast: "border-dashed border-forecast",
  none: "border-dotted border-line text-none",
};

export default function Coverage2026({ series }) {
  const { t } = useI18n();
  const rows = series.filter((row) => row.year === 2026);
  return (
    <section className="mt-6" aria-labelledby="coverage-title">
      <h2 id="coverage-title" className="m-0 mb-2 text-lg font-semibold">
        {t("coverage.title")}
      </h2>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 p-0">
        {Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          const row = rows.find((r) => r.month === month);
          const key = !row ? "none" : row.is_forecast ? "forecast" : "observed";
          return (
            <li key={month} data-state={key} className={`rounded-lg border px-2.5 py-1.5 text-sm ${itemClass[key]}`}>
              {t(`month.${month}`)}
              <small className="block text-muted">{t(`coverage.${key}`)}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
