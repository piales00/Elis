import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { prefersReducedMotion } from "../lib/hooks.js";
import { useGibsLayers } from "./imagery/useGibsLayers.js";
import { BASE_STYLE_URL, CELL_OUTLINE_COLOR, cellPaint, cellsToGeoJSON, featureBounds, mapPadding, tuneBasemap } from "../lib/mapStyle.js";
import { addTerrainFire, containsPoint, EXPLORE_CAMERA, REGION_3D_CAMERAS, setRelief } from "../lib/terrain.js";

maplibregl.setWorkerUrl(workerUrl);

const EMPTY = { type: "FeatureCollection", features: [] };

function coordLabel(t, value, pos, neg) {
  return `${Math.abs(value).toFixed(2)}°${t(`coord.${value < 0 ? neg : pos}`)}`;
}

export default function MapView({ regions, cells, metric, breaks, region, onRegionSelect, onCellSelect, imagery, ariaLabel, fill = false, onReady, onTerrainChange, focus = null }) {
  const { t, formatNumber } = useI18n();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const live = useRef({});
  const [ready, setReady] = useState(false);
  const [terrain, setTerrain] = useState(false);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const terrainRef = useRef(false);
  const flatCameraRef = useRef(null);
  const cellFeaturesRef = useRef([]);

  const changeTerrain = (enabled, move = true) => {
    const map = mapRef.current;
    if (!map?.getLayer("country-fill")) return;
    if (enabled && !terrainRef.current) flatCameraRef.current = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), padding: map.getPadding(), pitch: 0 };
    setRelief(map, enabled);
    map.setLayoutProperty("terrain-fire", "visibility", enabled ? "visible" : "none");
    map.setPaintProperty("cells-fill", "fill-opacity", enabled ? 0 : cellPaint().fillOpacity);
    live.current.onTerrainChange?.(enabled);
    terrainRef.current = enabled;
    setTerrain(enabled);
    map.doubleClickZoom[enabled ? "disable" : "enable"]();
    if (move) {
      const camera = enabled ? EXPLORE_CAMERA : flatCameraRef.current ?? { pitch: 0, bearing: 0 };
      if (prefersReducedMotion()) map.jumpTo(camera);
      else map.easeTo({ ...camera, duration: 700 });
    }
  };

  const flyHere = (point) => {
    const map = mapRef.current;
    const country = live.current.regions?.features.find((f) => f.properties.id === "peru");
    if (!map || !containsPoint(country, point)) return;
    changeTerrain(true, false);
    popupRef.current?.remove();
    const camera = { center: point, zoom: EXPLORE_CAMERA.zoom, pitch: EXPLORE_CAMERA.pitch, bearing: EXPLORE_CAMERA.bearing, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
    if (prefersReducedMotion()) map.jumpTo(camera);
    else map.flyTo({ ...camera, duration: 1800 });
  };

  const resetView = () => {
    const map = mapRef.current;
    const country = live.current.regions?.features.find((f) => f.properties.id === "peru");
    if (!map || !country) return;
    changeTerrain(false, false);
    popupRef.current?.remove();
    const bounds = featureBounds(country);
    const options = { padding: fill ? mapPadding(map) : 32, pitch: 0, bearing: 0 };
    if (prefersReducedMotion()) map.jumpTo({ ...map.cameraForBounds(bounds, options), ...options });
    else map.fitBounds(bounds, { ...options, duration: 700 });
  };

  const finishDrop = (e) => {
    if (dragRef.current !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    const map = mapRef.current;
    const box = map.getContainer().getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return;
    flyHere(map.unproject([e.clientX - box.left, e.clientY - box.top]));
  };

  live.current = { t, formatNumber, metric, onRegionSelect, onCellSelect, regions, region, onReady, onTerrainChange, focus };
  const { overZoom } = useGibsLayers(mapRef.current, ready, imagery, terrain);

  const fit = (duration) => {
    const map = mapRef.current;
    const { regions: geo, region: id, focus: target } = live.current;
    if (!map || !geo) return;
    const el = map.getContainer();
    if (el.clientWidth < 80 || el.clientHeight < 80) return;
    const feature = target ?? geo.features.find((f) => f.properties.id === id) ?? geo.features[0];
    map.fitBounds(featureBounds(feature), { padding: fill ? mapPadding(map) : 32, duration, maxZoom: target ? 8 : 9 });
  };

  useEffect(() => {
    if (!regions || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      maxPitch: 75,
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

    map.on("style.load", () => tuneBasemap(map));
    map.on("load", () => {
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
          "line-color": "#a3b5aa",
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
      addTerrainFire(map);
      map.resize();
      fit(0);
      setReady(true);
      live.current.onReady?.(map);
    });

    map.on("resetview", resetView);
    map.on("fly3d", (e) => {
      const targetRegion = e?.region || live.current.region || "peru";
      const preset = REGION_3D_CAMERAS[targetRegion] || EXPLORE_CAMERA;
      changeTerrain(true, false);
      popupRef.current?.remove();
      if (prefersReducedMotion()) map.jumpTo(preset);
      else map.flyTo({ ...preset, duration: 1800 });
    });
    map.on("dblclick", (e) => {
      if (!terrainRef.current) return;
      flyHere(e.lngLat);
    });

    const showCell = (e, persistent = false) => {
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
      if (persistent) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fc-btn mt-2";
        button.textContent = tt("map.flyHere");
        button.addEventListener("click", () => flyHere({ lng: Number(p.lon), lat: Number(p.lat) }));
        node.append(button);
      }
      popupRef.current.setLngLat(e.lngLat).setDOMContent(node).addTo(map);
    };

    map.on("mousemove", "cells-fill", (e) => {
      map.getCanvas().style.cursor = "pointer";
      if (!popupRef.current.isOpen() || !popupRef.current.getElement()?.querySelector("button")) showCell(e);
    });
    map.on("mouseleave", "cells-fill", () => {
      map.getCanvas().style.cursor = "";
      if (!popupRef.current.getElement()?.querySelector("button")) popupRef.current.remove();
    });
    map.on("mouseenter", "regions-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "regions-fill", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", (e) => {
      let cell = map.queryRenderedFeatures(e.point, { layers: ["cells-fill"] });
      if (terrainRef.current && !cell.length) {
        const distance = (f) => Math.hypot((f.properties.lon - e.lngLat.lng) * Math.cos(e.lngLat.lat * Math.PI / 180), f.properties.lat - e.lngLat.lat);
        const nearest = cellFeaturesRef.current.reduce((best, f) => f.properties.v > 0 && (!best || distance(f) < distance(best)) ? f : best, null);
        if (nearest && distance(nearest) <= 0.12) cell = [nearest];
      }
      if (cell.length) {
        showCell({ features: cell, lngLat: e.lngLat }, true);
        live.current.onCellSelect?.(cell[0].properties);
        return;
      }
      popupRef.current.remove();
      const hit =
        map.queryRenderedFeatures(e.point, { layers: ["regions-fill"] })[0] ??
        map.queryRenderedFeatures(e.point, { layers: ["country-fill"] })[0];
      if (hit && !terrainRef.current) live.current.onRegionSelect(hit.properties.id);
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
    const data = cells ? cellsToGeoJSON(cells, metric) : EMPTY;
    cellFeaturesRef.current = data.features;
    map.getSource("cells").setData(data);
    map.getSource("terrain-cells").setData({ ...data, features: data.features.filter((f) => f.properties.v > 0).map((f) => ({ ...f, geometry: { type: "Point", coordinates: [f.properties.lon, f.properties.lat] } })) });
  }, [ready, cells, metric]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !breaks) return;
    const paint = cellPaint(breaks);
    map.setPaintProperty("cells-fill", "fill-color", paint.fillColor);
    map.setPaintProperty("cells-outline", "line-width", paint.lineWidth);
    map.setPaintProperty("terrain-fire", "heatmap-weight", ["interpolate", ["linear"], ["get", "v"], 0, 0, breaks[3] * 1.25, 1]);
  }, [ready, breaks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("region-selected-line", ["==", ["get", "id"], region]);
    map.setPaintProperty("regions-fill", "fill-opacity", ["case", ["==", ["get", "id"], region], 0.07, 0.02]);
    if (!terrainRef.current) fit(prefersReducedMotion() ? 0 : 600);
  }, [ready, region, focus]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!ready || !map || !el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w < 80 || h < 80) return;
        map.resize();
        const widthChanged = Math.abs(w - last.w) > 2;
        const heightChanged = Math.abs(h - last.h) > 40;
        last = { w, h };
        if (widthChanged || heightChanged) fit(0);
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [ready]);

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
        onClick={resetView}
        className="btn-icon absolute left-3 top-3 font-medium"
      >
        {t("map.reset")}
      </button>}
      <div className={`absolute right-3 z-[6] flex flex-col items-end gap-2 ${fill ? "top-36" : "top-24"}`}>
        <button type="button" disabled={!ready} aria-pressed={terrain} aria-label={t("map.terrain")} title={t("map.terrain")} onClick={() => changeTerrain(!terrainRef.current)} className={`fc-float fc-press grid size-11 place-items-center rounded-xl text-sm font-bold ${terrain ? "!border-est !text-est" : ""}`}>
          3D
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label={t("map.drop")}
          aria-describedby="explore-drop-help"
          title={t("map.drop")}
          className="fc-float grid size-11 touch-none select-none place-items-center rounded-xl text-est cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            if (!e.isPrimary || e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = e.pointerId;
            setDrag({ x: e.clientX, y: e.clientY });
          }}
          onPointerMove={(e) => { if (dragRef.current === e.pointerId) setDrag({ x: e.clientX, y: e.clientY }); }}
          onPointerUp={finishDrop}
          onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
          onLostPointerCapture={() => { dragRef.current = null; setDrag(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") { dragRef.current = null; setDrag(null); } }}
          onClick={(e) => { if (e.detail === 0) flyHere(mapRef.current.getCenter()); }}
        >
          <svg aria-hidden="true" viewBox="0 0 32 40" width="24" height="30" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 37S4 23 4 15a12 12 0 0 1 24 0c0 8-12 22-12 22Z" fill="var(--surface)" />
            <path d="m10 20 6-12 6 12-6-3-6 3Z" fill="currentColor" strokeLinejoin="round" />
            <circle cx="16" cy="26" r="1" />
          </svg>
        </button>
        <span className="fc-float max-w-32 rounded-lg px-2 py-1 text-right text-xs">{t("map.drop")}</span>
      </div>
      <span id="explore-drop-help" className="sr-only">{t("map.dropHelp")}</span>
      {drag && <div aria-hidden="true" className="pointer-events-none fixed z-[100] text-est" style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -100%)" }}>
        <svg viewBox="0 0 32 40" width="32" height="40" fill="var(--surface)" stroke="currentColor" strokeWidth="2"><path d="M16 37S4 23 4 15a12 12 0 0 1 24 0c0 8-12 22-12 22Z" /><path d="m10 20 6-12 6 12-6-3-6 3Z" fill="currentColor" /></svg>
      </div>}
      {overZoom && !terrain && (
        <p role="note" className="pointer-events-none absolute bottom-16 right-3 m-0 max-w-[16rem] rounded-xl border border-line bg-bg/90 px-3 py-2 text-xs">
          {t("imagery.zoomNote", { meters: imagery.raster.pixel ?? 375 })}
        </p>
      )}
    </div>
  );
}
