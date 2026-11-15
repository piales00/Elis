import { useEffect } from "react";
import { prefersReducedMotion } from "../../lib/hooks.js";
import { FIRE_COLORS, FOOTPRINT_MIN_ZOOM, GIBS_ATTRIBUTION, RASTER_MAX_ZOOM } from "../../lib/gibs.js";

const EMPTY = { type: "FeatureCollection", features: [] };
const CELL_LAYERS = ["cells-fill", "cells-outline"];
const FIRE_LAYERS = ["fires-viirs-fp", "fires-modis-fp", "fires-modis-fp-line", "fires-viirs-pt", "fires-modis-pt"];

function firstSymbol(map) {
  return map.getStyle().layers.find((l) => l.type === "symbol")?.id;
}

function addFireLayers(map) {
  const before = firstSymbol(map);
  for (const id of ["fires-modis-pt", "fires-modis-fp", "fires-viirs-pt", "fires-viirs-fp"]) map.addSource(id, { type: "geojson", data: EMPTY });
  map.addLayer(
    { id: "fires-viirs-fp", type: "fill", source: "fires-viirs-fp", minzoom: FOOTPRINT_MIN_ZOOM, paint: { "fill-color": FIRE_COLORS.viirs, "fill-opacity": 0.85 } },
    before,
  );
  map.addLayer(
    { id: "fires-modis-fp", type: "fill", source: "fires-modis-fp", minzoom: FOOTPRINT_MIN_ZOOM, paint: { "fill-color": FIRE_COLORS.modis, "fill-opacity": 0.18 } },
    before,
  );
  map.addLayer(
    {
      id: "fires-modis-fp-line",
      type: "line",
      source: "fires-modis-fp",
      minzoom: FOOTPRINT_MIN_ZOOM,
      paint: { "line-color": FIRE_COLORS.modis, "line-width": 1.6 },
    },
    before,
  );
  map.addLayer(
    {
      id: "fires-viirs-pt",
      type: "circle",
      source: "fires-viirs-pt",
      maxzoom: FOOTPRINT_MIN_ZOOM,
      paint: {
        "circle-color": FIRE_COLORS.viirs,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.6, 7, 2.6],
        "circle-opacity": 0.9,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "fires-modis-pt",
      type: "circle",
      source: "fires-modis-pt",
      maxzoom: FOOTPRINT_MIN_ZOOM,
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.4, 7, 4.5],
        "circle-stroke-color": FIRE_COLORS.modis,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 7, 1.5],
      },
    },
    before,
  );
}

function setVisibility(map, ids, visible) {
  for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

export function useGibsLayers(map, ready, imagery) {
  const enabled = Boolean(imagery?.enabled);
  const tileUrl = enabled ? imagery.raster?.tiles[0] ?? null : null;

  useEffect(() => {
    if (!ready || !map) return;
    if (!map.getSource("fires-modis-pt")) addFireLayers(map);
    setVisibility(map, CELL_LAYERS, !enabled);
    setVisibility(map, FIRE_LAYERS, enabled);
  }, [map, ready, enabled]);

  useEffect(() => {
    if (!ready || !map) return;
    if (map.getLayer("gibs-imagery")) map.removeLayer("gibs-imagery");
    if (map.getSource("gibs-imagery")) map.removeSource("gibs-imagery");
    if (!tileUrl) return;
    map.addSource("gibs-imagery", {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: RASTER_MAX_ZOOM,
      attribution: `<a href="https://worldview.earthdata.nasa.gov" target="_blank" rel="noopener">${GIBS_ATTRIBUTION}</a>`,
    });
    map.addLayer({ id: "gibs-imagery", type: "raster", source: "gibs-imagery", paint: { "raster-fade-duration": 0 } }, map.getLayer("country-fill") ? "country-fill" : firstSymbol(map));
  }, [map, ready, tileUrl]);

  useEffect(() => {
    if (!ready || !map || !map.getSource("fires-modis-pt")) return;
    map.getSource("fires-modis-pt").setData(imagery?.modisPoints ?? EMPTY);
    map.getSource("fires-modis-fp").setData(imagery?.modisFootprints ?? EMPTY);
    map.getSource("fires-viirs-pt").setData(imagery?.viirsPoints ?? EMPTY);
    map.getSource("fires-viirs-fp").setData(imagery?.viirsFootprints ?? EMPTY);
  }, [map, ready, imagery?.modisPoints, imagery?.modisFootprints, imagery?.viirsPoints, imagery?.viirsFootprints]);

  const focusKey = imagery?.focus?.key;
  useEffect(() => {
    if (!ready || !map || !imagery?.focus) return;
    const { lon, lat, zoom } = imagery.focus;
    map.easeTo({ center: lon === undefined ? map.getCenter() : [lon, lat], zoom, duration: prefersReducedMotion() ? 0 : 900 });
  }, [map, ready, focusKey]);
}
