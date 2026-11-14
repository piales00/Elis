import { useI18n } from "../i18n/I18nProvider.jsx";
import { CELL_BREAKS, CELL_COLORS, CELL_OUTLINE_WIDTHS } from "../lib/mapStyle.js";
import { isMock } from "../data/client.js";

export default function MapLegend({ metric }) {
  const { t, formatNumber } = useI18n();
  const labels = [
    `< ${formatNumber(CELL_BREAKS[0])}`,
    ...CELL_BREAKS.slice(0, -1).map((b, i) => `${formatNumber(b)}–${formatNumber(CELL_BREAKS[i + 1])}`),
    t("map.legend.last", { from: formatNumber(CELL_BREAKS[CELL_BREAKS.length - 1]) }),
  ];
  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-sm">
      <h3 className="m-0 text-base font-semibold">{t("map.legend.title", { metric: t(`metric.${metric}`) })}</h3>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0">
        {CELL_COLORS.map((color, i) => (
          <li key={color} className="flex items-center gap-3">
            <svg width="26" height="18" aria-hidden="true">
              <rect x="3" y="3" width="20" height="12" style={{ fill: color, stroke: "var(--fg)", strokeWidth: CELL_OUTLINE_WIDTHS[i] }} />
            </svg>
            <span className="tabular-nums">{labels[i]}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-xs text-muted">{t("map.legend.note")}</p>
      <ul className="m-0 mt-4 grid list-none gap-2 p-0">
        <li className="flex items-center gap-3">
          <svg width="26" height="10" aria-hidden="true">
            <line x1="1" x2="25" y1="5" y2="5" strokeWidth="1.5" strokeDasharray="4 3" style={{ stroke: "var(--fg)" }} />
          </svg>
          <span>{t("map.legend.region")}</span>
        </li>
        <li className="flex items-center gap-3">
          <svg width="26" height="10" aria-hidden="true">
            <line x1="1" x2="25" y1="5" y2="5" strokeWidth="3.5" style={{ stroke: "#0072b2" }} />
          </svg>
          <span>{t("map.legend.selected")}</span>
        </li>
      </ul>
      <p className="m-0 mt-3 text-xs text-muted">{t(isMock ? "map.boundaries.mock" : "map.boundaries.api")}</p>
    </div>
  );
}
