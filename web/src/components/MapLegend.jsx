import { useI18n } from "../i18n/I18nProvider.jsx";
import { CELL_COLORS, CELL_OUTLINE_COLOR, CELL_OUTLINE_WIDTHS } from "../lib/mapStyle.js";

export default function MapLegend({ metric, breaks, terrain = false }) {
  const { t, formatNumber } = useI18n();
  const fmt = (v) => formatNumber(v, { maximumFractionDigits: 1 });
  const labels = [
    `< ${fmt(breaks[0])}`,
    ...breaks.slice(0, -1).map((b, i) => `${fmt(b)}–${fmt(breaks[i + 1])}`),
    t("map.legend.last", { from: fmt(breaks[breaks.length - 1]) }),
  ];
  return (
    <div className="rounded-xl border border-line bg-bg/90 px-3 py-2.5 text-xs">
      <p className="m-0 mb-2 font-head text-[13px] font-bold">{t("map.legend.title", { metric: t(`metric.${metric}`) })}</p>
      <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0">
        {CELL_COLORS.map((color, i) => (
          <li key={color} className="flex items-center gap-1.5">
            <svg width="16" height="12" aria-hidden="true">
              {terrain ? <circle cx="8" cy="6" r="5" fill={color} style={{ filter: "blur(2px)" }} /> : <rect x="1" y="1" width="14" height="10" rx="2" style={{ fill: color, stroke: CELL_OUTLINE_COLOR, strokeWidth: CELL_OUTLINE_WIDTHS[i] }} />}
            </svg>
            <span className="tabular-nums">{labels[i]}</span>
          </li>
        ))}
      </ul>
      {terrain && <p className="m-0 mt-2 text-muted">Smoothed cell activity · not burned area. Satellite basemap: 2020.</p>}
      <p className="m-0 mt-2 text-muted">{t("map.legend.note")}</p>
    </div>
  );
}
