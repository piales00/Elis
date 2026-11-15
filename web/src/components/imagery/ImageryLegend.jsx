import { useI18n } from "../../i18n/I18nProvider.jsx";
import { FIRE_COLORS, HEAT_MAX_FRP, HEAT_RAMP } from "../../lib/gibs.js";

export default function ImageryLegend({ dateLabel, detections, regionLabel, heat }) {
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
      {detections.raster && <p className="m-0 mb-2 text-muted">{t("imagery.legend.source", { source: detections.raster.sourceLabel, meters: detections.raster.pixel })}</p>}
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
      {heat && (
        <div className="mt-2">
          <p className="m-0 mb-1 font-semibold">{t("imagery.heat.legend")}</p>
          <div className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(to right, ${HEAT_RAMP.slice(1).join(", ")})` }} aria-hidden="true" />
          <div className="flex w-40 justify-between tabular-nums text-muted">
            <span>0</span>
            <span>{`≥${HEAT_MAX_FRP}`}</span>
          </div>
        </div>
      )}
      <p className="m-0 mt-2 hidden max-w-[20rem] text-muted sm:block">{t("imagery.legend.scale")}</p>
      <p className="m-0 mt-2 max-w-[20rem] text-muted">{t("imagery.satellite.gaps")}</p>
    </div>
  );
}
