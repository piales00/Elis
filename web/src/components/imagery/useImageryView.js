import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import {
  daysInMonth,
  densestSpot,
  DEFAULT_IMAGERY_DAY,
  detectionsToFootprints,
  detectionsToHeat,
  detectionsToPoints,
  imageryLayer,
  imagerySatellites,
  isoDate,
  RASTER_MAX_ZOOM,
} from "../../lib/gibs.js";
import { useDailyDetections } from "./useDailyDetections.js";

export function useImageryView({ period, onPeriodChange, regions, region }) {
  const { t } = useI18n();
  const [view, setView] = useState("cells");
  const [base, setBase] = useState("truecolor");
  const [satellite, setSatellite] = useState(null);
  const [heat, setHeat] = useState(true);
  const [day, setDay] = useState(DEFAULT_IMAGERY_DAY.day);
  const [cell, setCell] = useState(null);
  const [focus, setFocus] = useState(null);
  const cellKey = `${period.year}-${period.month}-${region}`;
  const activeCell = cell?.key === cellKey ? cell : null;

  const date = { year: period.year, month: period.month, day: Math.min(day, daysInMonth(period.year, period.month)) };
  const iso = isoDate(date);
  const dateLabel = `${date.day} ${t(`month.${date.month}`)} ${date.year}`;
  const area = useMemo(() => regions?.features.find((f) => f.properties.id === region) ?? null, [regions, region]);
  const showing = view === "imagery";
  const satellites = useMemo(() => imagerySatellites(base, iso), [base, iso]);
  const raster = useMemo(() => imageryLayer(base, iso, satellite), [base, iso, satellite]);
  const detections = useDailyDetections({ date: iso, area, enabled: showing });

  const geo = useMemo(
    () => ({
      modisPoints: detectionsToPoints(detections.modis),
      modisFootprints: detectionsToFootprints(detections.modis),
      viirsPoints: detectionsToPoints(detections.viirs),
      viirsFootprints: detectionsToFootprints(detections.viirs),
      heatPoints: detectionsToHeat(detections.modis, detections.viirs),
    }),
    [detections.modis, detections.viirs],
  );

  const imagery = useMemo(() => ({ enabled: showing, raster, focus, heat, ...geo }), [showing, raster, focus, heat, geo]);

  let message = null;
  let isError = false;
  if (showing) {
    if (detections.status === "error") {
      message = t("status.error", { message: detections.error?.message ?? String(detections.error) });
      isError = true;
    } else if (!raster) message = t("imagery.status.noImage", { date: dateLabel });
    else if (!detections.layers.viirs && !detections.layers.modis) message = t("imagery.status.noDetections", { date: dateLabel });
    else if (!detections.layers.viirs) message = t("imagery.status.noViirs", { date: dateLabel });
    else if (detections.status === "loading") message = t("imagery.status.loading");
  }

  const setDate = (next) => {
    setDay(next.day);
    if (next.year !== period.year || next.month !== period.month) onPeriodChange({ year: next.year, month: next.month });
  };

  return {
    view,
    setView,
    base,
    setBase,
    date,
    setDate,
    dateLabel,
    raster,
    satellites,
    setSatellite,
    heat,
    setHeat,
    detections,
    imagery,
    message,
    isError,
    cell: activeCell,
    selectCell: (c) => setCell({ ...c, key: cellKey }),
    clearCell: () => setCell(null),
    showImagery: () => {
      setView("imagery");
      if (activeCell) setFocus({ lon: activeCell.lon, lat: activeCell.lat, zoom: RASTER_MAX_ZOOM, key: Date.now() });
    },
    trueScale: () => {
      const spot = activeCell ?? densestSpot(detections.viirs.length ? detections.viirs : detections.modis);
      setFocus({ lon: spot?.lon, lat: spot?.lat, zoom: RASTER_MAX_ZOOM, key: Date.now() });
    },
  };
}
