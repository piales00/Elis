import { useI18n } from "../../i18n/I18nProvider.jsx";
import { FIRE_COLORS } from "../../lib/gibs.js";

export default function ImageryLegend({ dateLabel, detections, regionLabel }) {
  const { t, formatNumber } = useI18n();
  const ready = detections.status === "ready";
  const count = (sensor) => {
    if (!detections.layers[sensor]) return t("imagery.legend.noData");
    if (!ready) return "…";
    return formatNumber(detections[sensor].length);
  };

  return (
    <div className="rounded-xl border border-line bg-bg/90 px-3 py-2.5 text-xs">
      <p className="m-0 mb-2 font-head text-[13px] font-bold">{t("imagery.legend.title", { date: dateLabel, region: regionLabel })}</p>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        <li className="flex items-center gap-2">
          <svg width="16" height="16" aria-hidden="true">
            <rect x="2" y="2" width="12" height="12" style={{ fill: FIRE_COLORS.modis, fillOpacity: 0.2, stroke: FIRE_COLORS.modis, strokeWidth: 1.6 }} />
          </svg>
          <span className="flex-1">{t("imagery.legend.modis")}</span>
          <span className="font-semibold tabular-nums">{count("modis")}</span>
        </li>
        <li className="flex items-center gap-2">
          <svg width="16" height="16" aria-hidden="true">
            <rect x="5.5" y="5.5" width="5" height="5" style={{ fill: FIRE_COLORS.viirs }} />
          </svg>
          <span className="flex-1">{t("imagery.legend.viirs")}</span>
          <span className="font-semibold tabular-nums">{count("viirs")}</span>
        </li>
      </ul>
      <p className="m-0 mt-2 hidden max-w-[20rem] text-muted sm:block">{t("imagery.legend.scale")}</p>
    </div>
  );
}
