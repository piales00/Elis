import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { prefersReducedMotion } from "../lib/hooks.js";
import { useGibsLayers } from "./imagery/useGibsLayers.js";
import { BASE_STYLE_URL, CELL_OUTLINE_COLOR, cellPaint, cellsToGeoJSON, featureBounds, tuneBasemap } from "../lib/mapStyle.js";

maplibregl.setWorkerUrl(workerUrl);

const EMPTY = { type: "FeatureCollection", features: [] };

function coordLabel(t, value, pos, neg) {
  return `${Math.abs(value).toFixed(2)}°${t(`coord.${value < 0 ? neg : pos}`)}`;
}

export default function MapView({ regions, cells, metric, breaks, region, onRegionSelect, onCellSelect, imagery, ariaLabel, fill = false, onReady }) {
  const { t, formatNumber } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const live = useRef({});
  const [ready, setReady] = useState(false);

  live.current = { t, formatNumber, metric, onRegionSelect, onCellSelect, regions, region, onReady };
  const { overZoom } = useGibsLayers(mapRef.current, ready, imagery);

  const fit = (duration) => {
    const map = mapRef.current;
    const { regions: geo, region: id } = live.current;
    if (!map || !geo) return;
    const feature = geo.features.find((f) => f.properties.id === id) ?? geo.features[0];
    map.fitBounds(featureBounds(feature), { padding: 32, duration, maxZoom: 9 });
  };

  useEffect(() => {
    if (!regions || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      bounds: featureBounds(regions.features.find((f) => f.properties.id === "peru") ?? regions.features[0]),
      fitBoundsOptions: { padding: 32 },
      attributionControl: { compact: true },
      cooperativeGestures: !fill,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": t("map.gesture.desktop", { key: "Ctrl" }),
        "CooperativeGesturesHandler.MacHelpText": t("map.gesture.desktop", { key: "⌘" }),
        "CooperativeGesturesHandler.MobileHelpText": t("map.gesture.mobile"),
        "NavigationControl.ZoomIn": t("map.zoomIn"),
        "NavigationControl.ZoomOut": t("map.zoomOut"),
        "NavigationControl.ResetBearing": t("map.resetBearing"),
        "FullscreenControl.Enter": t("map.fullscreen.enter"),
        "FullscreenControl.Exit": t("map.fullscreen.exit"),
        "AttributionControl.ToggleAttribution": t("map.attribution"),
        "AttributionControl.MapFeedback": t("map.feedback"),
      },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), fill ? "bottom-right" : "top-right");
    if (!fill) map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "240px" });

    map.on("load", () => {
      tuneBasemap(map);
      const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      const addLayer = (layer) => map.addLayer(layer, before);
      map.addSource("regions", { type: "geojson", data: regions });
      map.addSource("cells", { type: "geojson", data: EMPTY });
      addLayer({
        id: "country-fill",
        type: "fill",
        source: "regions",
        filter: ["==", ["get", "level"], "country"],
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      });
      addLayer({
        id: "regions-fill",
        type: "fill",
        source: "regions",
        filter: ["==", ["get", "level"], "macro"],
        paint: { "fill-color": "#58b8d8", "fill-opacity": 0.04 },
      });
      addLayer({
        id: "regions-line",
        type: "line",
        source: "regions",
        paint: {
          "line-color": "#9daabd",
          "line-width": 0.8,
          "line-opacity": 0.22,
          "line-dasharray": [3, 3],
        },
      });
      addLayer({
        id: "region-selected-line",
        type: "line",
        source: "regions",
        filter: ["==", ["get", "id"], ""],
        paint: { "line-color": "#58b8d8", "line-width": 1.4, "line-opacity": 0.5 },
      });
      addLayer({
        id: "cells-fill",
        type: "fill",
        source: "cells",
        paint: { "fill-color": cellPaint().fillColor, "fill-opacity": cellPaint().fillOpacity },
      });
      addLayer({
        id: "cells-outline",
        type: "line",
        source: "cells",
        paint: {
          "line-color": CELL_OUTLINE_COLOR,
          "line-width": cellPaint().lineWidth,
        },
      });
      setReady(true);
      live.current.onReady?.(map);
    });

    const showCell = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const { t: tt, formatNumber: fmt } = live.current;
      const p = f.properties;
      const node = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = tt("map.popup.cell", {
        lat: coordLabel(tt, p.lat, "N", "S"),
        lon: coordLabel(tt, p.lon, "E", "W"),
      });
      node.append(title);
      for (const key of ["estimated", "raw_modis", "raw_terra", "raw_aqua", "raw_viirs", "raw_viirs_noaa20", "raw_viirs_noaa21"]) {
        const row = document.createElement("div");
        const raw = p[key];
        row.textContent = `${tt(`metric.${key}`)}: ${raw === null || raw === undefined || raw === "null" ? tt("series.na") : fmt(raw)}`;
        node.append(row);
      }
      popupRef.current.setLngLat(e.lngLat).setDOMContent(node).addTo(map);
    };

    map.on("mousemove", "cells-fill", (e) => {
      map.getCanvas().style.cursor = "pointer";
      showCell(e);
    });
    map.on("mouseleave", "cells-fill", () => {
      map.getCanvas().style.cursor = "";
      popupRef.current.remove();
    });
    map.on("mouseenter", "regions-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "regions-fill", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", (e) => {
      const cell = map.queryRenderedFeatures(e.point, { layers: ["cells-fill"] });
      if (cell.length) {
        showCell({ features: cell, lngLat: e.lngLat });
        live.current.onCellSelect?.(cell[0].properties);
        return;
      }
      popupRef.current.remove();
      const hit =
        map.queryRenderedFeatures(e.point, { layers: ["regions-fill"] })[0] ??
        map.queryRenderedFeatures(e.point, { layers: ["country-fill"] })[0];
      if (hit) live.current.onRegionSelect(hit.properties.id);
    });

    return () => {
      live.current.onReady?.(null);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [regions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource("cells").setData(cells ? cellsToGeoJSON(cells, metric) : EMPTY);
  }, [ready, cells, metric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !breaks) return;
    const paint = cellPaint(breaks);
    map.setPaintProperty("cells-fill", "fill-color", paint.fillColor);
    map.setPaintProperty("cells-outline", "line-width", paint.lineWidth);
  }, [ready, breaks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("region-selected-line", ["==", ["get", "id"], region]);
    map.setPaintProperty("regions-fill", "fill-opacity", ["case", ["==", ["get", "id"], region], 0.07, 0.02]);
    fit(prefersReducedMotion() ? 0 : 600);
  }, [ready, region]);

  return (
    <div className={fill ? "relative h-full w-full" : "relative"}>
      <div
        ref={containerRef}
        role="region"
        aria-label={ariaLabel}
        className={fill ? "h-full w-full" : "h-[460px] w-full overflow-hidden rounded-2xl border border-line sm:h-[560px] lg:h-[640px]"}
      />
      {!fill && <button
        type="button"
        onClick={() => fit(prefersReducedMotion() ? 0 : 600)}
        className="btn-icon absolute left-3 top-3 font-medium"
      >
        {t("map.reset")}
      </button>}
      {overZoom && (
        <p role="note" className="pointer-events-none absolute bottom-16 right-3 m-0 max-w-[16rem] rounded-xl border border-line bg-bg/90 px-3 py-2 text-xs">
          {t("imagery.zoomNote", { meters: imagery.raster.pixel ?? 375 })}
        </p>
      )}
    </div>
  );
}
