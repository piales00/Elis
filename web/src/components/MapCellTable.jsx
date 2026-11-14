import { useI18n } from "../i18n/I18nProvider.jsx";

const LIMIT = 10;

export default function MapCellTable({ cells, metric }) {
  const { t, formatNumber } = useI18n();
  if (!cells.length) return null;
  const rows = cells.filter((c) => c[metric] !== null && c[metric] !== undefined).sort((a, b) => b[metric] - a[metric]).slice(0, LIMIT);
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const coord = (v, pos, neg) => `${Math.abs(v).toFixed(2)}°${t(`coord.${v < 0 ? neg : pos}`)}`;
  const th = "whitespace-nowrap border-b border-line px-2.5 py-1 text-right first:text-left";
  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">{t("map.table.summary")}</summary>
      <p className="mb-2 mt-2 text-sm text-muted">{t("map.table.note", { shown: rows.length, total: cells.length })}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              <th scope="col" className={th}>{t("map.table.lat")}</th>
              <th scope="col" className={th}>{t("map.table.lon")}</th>
              <th scope="col" className={th}>{t("metric.estimated")}</th>
              <th scope="col" className={th}>{t("metric.raw_modis")}</th>
              <th scope="col" className={th}>{t("metric.raw_terra")}</th>
              <th scope="col" className={th}>{t("metric.raw_aqua")}</th>
              <th scope="col" className={th}>{t("metric.raw_viirs")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={`${c.lat},${c.lon}`}>
                <td className="border-b border-line px-2.5 py-1 text-left">{coord(c.lat, "N", "S")}</td>
                <td className="border-b border-line px-2.5 py-1 text-right">{coord(c.lon, "E", "W")}</td>
                <td className="border-b border-line px-2.5 py-1 text-right">{num(c.estimated)}</td>
                <td className="border-b border-line px-2.5 py-1 text-right">{num(c.raw_modis)}</td>
                <td className="border-b border-line px-2.5 py-1 text-right">{num(c.raw_terra)}</td>
                <td className="border-b border-line px-2.5 py-1 text-right">{num(c.raw_aqua)}</td>
                <td className="border-b border-line px-2.5 py-1 text-right">{num(c.raw_viirs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
