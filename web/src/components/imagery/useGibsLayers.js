import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../../lib/hooks.js";
import { FIRE_COLORS, FOOTPRINT_MIN_ZOOM, GIBS_ATTRIBUTION, HEAT_MAX_FRP, HEAT_RAMP } from "../../lib/gibs.js";
import "./gibsProtocol.js";

const EMPTY = { type: "FeatureCollection", features: [] };
const FIRE_LAYERS = ["fires-heat", "fires-viirs-fp", "fires-modis-fp", "fires-modis-fp-line", "fires-viirs-pt", "fires-modis-pt"];

function firstSymbol(map) {
  return map.getStyle().layers.find((l) => l.type === "symbol")?.id;
}

function addFireLayers(map) {
  const before = firstSymbol(map);
  map.addSource("fires-heat", { type: "geojson", data: EMPTY });
  const ramp = HEAT_RAMP.flatMap((color, i) => [i / (HEAT_RAMP.length - 1), color]);
  map.addLayer(
    {
      id: "fires-heat",
      type: "heatmap",
      source: "fires-heat",
      maxzoom: FOOTPRINT_MIN_ZOOM + 1,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["coalesce", ["get", "frp"], 0], 0, 0.05, HEAT_MAX_FRP, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.6, FOOTPRINT_MIN_ZOOM, 1.6],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 6, 12, FOOTPRINT_MIN_ZOOM, 24],
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], ...ramp],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], FOOTPRINT_MIN_ZOOM - 0.5, 0.85, FOOTPRINT_MIN_ZOOM + 1, 0],
      },
    },
    before,
  );
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

export function useGibsLayers(map, ready, imagery, terrain = false) {
  const enabled = Boolean(imagery?.enabled);
  const rasterLayers = enabled && imagery.raster ? [...(imagery.raster.gapFill ?? []).slice().reverse(), imagery.raster] : [];
  const rasterKey = JSON.stringify(rasterLayers.map(({ tiles, maxZoom, attribution }) => ({ tiles, maxZoom, attribution })));
  const rasterMaxZoom = enabled ? imagery.raster?.maxZoom ?? null : null;
  const heat = enabled && Boolean(imagery?.heat);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    if (!ready || !map) return;
    if (!map.getSource("fires-modis-pt")) addFireLayers(map);
    setVisibility(map, ["cells-fill"], terrain || !enabled);
    setVisibility(map, ["cells-outline"], !terrain && !enabled);
    setVisibility(map, ["terrain-fire"], terrain);
    setVisibility(map, FIRE_LAYERS, enabled && !terrain);
    setVisibility(map, ["fires-heat"], heat && !terrain);
  }, [map, ready, enabled, heat, terrain]);

  useEffect(() => {
    if (!ready || !map) return;
    const update = () => setZoom(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => map.off("zoomend", update);
  }, [map, ready]);

  useEffect(() => {
    if (!ready || !map) return;
    map.setMaxZoom(terrain || rasterMaxZoom === null ? 22 : Math.max(rasterMaxZoom, FOOTPRINT_MIN_ZOOM) + 1);
  }, [map, ready, rasterMaxZoom, terrain]);

  useEffect(() => {
    if (!ready || !map) return;
    const layers = JSON.parse(rasterKey);
    const ids = layers.map((_, i) => i === layers.length - 1 ? "gibs-imagery" : `gibs-imagery-fill-${i}`);
    layers.forEach((layer, i) => {
      map.addSource(ids[i], {
        type: "raster",
        tiles: layer.tiles,
        tileSize: 256,
        maxzoom: layer.maxZoom,
        attribution: `<a href="https://worldview.earthdata.nasa.gov" target="_blank" rel="noopener">${layer.attribution ?? GIBS_ATTRIBUTION}</a>`,
      });
      map.addLayer({ id: ids[i], type: "raster", source: ids[i], layout: { visibility: terrain ? "none" : "visible" }, paint: { "raster-fade-duration": 0 } }, map.getLayer("country-fill") ? "country-fill" : firstSymbol(map));
    });
    return () => {
      for (const id of ids.slice().reverse()) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
    };
  }, [map, ready, rasterKey, terrain]);

  useEffect(() => {
    if (!ready || !map || !map.getSource("fires-modis-pt")) return;
    map.getSource("fires-modis-pt").setData(imagery?.modisPoints ?? EMPTY);
    map.getSource("fires-modis-fp").setData(imagery?.modisFootprints ?? EMPTY);
    map.getSource("fires-viirs-pt").setData(imagery?.viirsPoints ?? EMPTY);
    map.getSource("fires-viirs-fp").setData(imagery?.viirsFootprints ?? EMPTY);
    map.getSource("fires-heat").setData(imagery?.heatPoints ?? EMPTY);
  }, [map, ready, imagery?.modisPoints, imagery?.modisFootprints, imagery?.viirsPoints, imagery?.viirsFootprints, imagery?.heatPoints]);

  const focusKey = imagery?.focus?.key;
  useEffect(() => {
    if (!ready || !map || !imagery?.focus) return;
    const { lon, lat, zoom } = imagery.focus;
    map.easeTo({ center: lon === undefined ? map.getCenter() : [lon, lat], zoom, duration: prefersReducedMotion() ? 0 : 900 });
  }, [map, ready, focusKey]);

  return { overZoom: rasterMaxZoom !== null && zoom !== null && zoom > rasterMaxZoom + 0.05 };
}
