import { useI18n } from "../i18n/I18nProvider.jsx";

const COLUMNS = [
  "period",
  "raw_modis",
  "raw_viirs",
  "raw_detections",
  "estimated",
  "range",
  "modis_equiv",
  "hist_median",
  "anomaly",
  "source",
  "status",
];
const LEFT = new Set(["period", "anomaly", "source", "status"]);

export default function SeriesTable({ series }) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const rows = series.slice().sort((a, b) => a.year - b.year || a.month - b.month);
  return (
    <section className="mt-6" aria-labelledby="series-title">
      <h2 id="series-title" className="m-0 mb-2 text-lg font-semibold">
        {t("series.title")}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} scope="col" className={`whitespace-nowrap border-b border-line px-2.5 py-1 ${LEFT.has(c) ? "text-left" : "text-right"}`}>
                  {t(`series.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cells = [
                `${t(`month.${row.month}`)} ${row.year}`,
                num(row.raw_modis),
                num(row.raw_viirs),
                num(row.raw_detections),
                num(row.estimated),
                `${num(row.est_low)} – ${num(row.est_high)}`,
                num(row.modis_equiv),
                num(row.hist_median),
                t(`anomaly.${row.anomaly_class}`),
                t(`source.${row.source}`),
                t(row.is_forecast ? "status.forecast" : "status.observed"),
              ];
              return (
                <tr key={`${row.year}-${row.month}`} className={row.is_forecast ? "italic text-forecast" : ""}>
                  {cells.map((c, i) => (
                    <td key={COLUMNS[i]} className={`whitespace-nowrap border-b border-line px-2.5 py-1 ${LEFT.has(COLUMNS[i]) ? "text-left" : "text-right"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
