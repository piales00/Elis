import { isMock } from "../data/client.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export default function DataSummary({ series, regionCount, mapCells, methodology }) {
  const { t, formatNumber } = useI18n();
  const rows = [
    ["summary.source", t(isMock ? "summary.source.mock" : "summary.source.api")],
    ["summary.series_rows", formatNumber(series.length)],
    ["summary.regions", formatNumber(regionCount)],
    ["summary.map_cells", formatNumber(mapCells.length)],
    [
      "summary.methodology",
      methodology ? `${methodology.detection.length} / ${methodology.validation.length}` : t("series.na"),
    ],
  ];
  return (
    <section className="mt-6" aria-labelledby="summary-title">
      <h2 id="summary-title" className="m-0 mb-2 text-lg font-semibold">
        {t("summary.title")}
      </h2>
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{t(key)}</dt>
            <dd className="m-0">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
