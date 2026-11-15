export const CELL_COLORS = ["#7b3f5e", "#c4503f", "#ee8a3c", "#f7c35a", "#fff1c0"];
export const CELL_BREAKS = [5, 10, 15, 20];
export const CELL_OUTLINE_WIDTHS = [0.3, 0.4, 0.5, 0.6, 0.7];
export const BASEMAP = {
  land: "#0c1612",
  cover: "#0f1b16",
  water: "#112d37",
  waterway: "#2a5f6d",
  boundary: "#2f4a3c",
  line: "#1b2b23",
  label: "#94a99c",
  waterLabel: "#7fa6ac",
  halo: "#0c1612",
};
export const CELL_OUTLINE_COLOR = BASEMAP.land;
export const VECTOR_LABELS = { "text-color": BASEMAP.label, "text-halo-color": BASEMAP.halo, "text-halo-width": 1.4 };
export const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

const HIDDEN_LAYERS = /^(aeroway|road_|highway_|railway|building|boundary_state|place_other|place_suburb|place_village|place_town|place_state)/;
const KEPT_LABELS = ["place_city", "place_city_large", "place_state", "place_country_other", "place_country_minor", "place_country_major", "water_name"];

const BASE_SOURCE = "openmaptiles";

function basemapPaint(layer) {
  if (layer.type === "background") return { "background-color": BASEMAP.land };
  if (layer.source !== BASE_SOURCE) return null;
  const sl = layer["source-layer"];
  if (layer.type === "fill") {
    if (sl === "water") return { "fill-color": BASEMAP.water };
    if (sl === "landcover" || sl === "landuse" || sl === "park") return { "fill-color": BASEMAP.cover };
    return { "fill-color": BASEMAP.land, "fill-outline-color": BASEMAP.line };
  }
  if (layer.type === "line") {
    if (sl === "waterway") return { "line-color": BASEMAP.waterway };
    if (sl === "boundary") return { "line-color": BASEMAP.boundary };
    return { "line-color": BASEMAP.line };
  }
  if (layer.type === "symbol") {
    if (sl === "water_name") return { "text-color": BASEMAP.waterLabel, "text-halo-color": BASEMAP.halo, "text-halo-width": 1.4 };
    return VECTOR_LABELS;
  }
  return null;
}

export function tuneBasemap(map) {
  for (const layer of map.getStyle().layers) {
    if (HIDDEN_LAYERS.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
    const paint = basemapPaint(layer);
    if (paint) for (const [prop, value] of Object.entries(paint)) map.setPaintProperty(layer.id, prop, value);
  }
  if (map.getLayer("place_city")) map.setLayerZoomRange("place_city", 6, 24);
  if (map.getLayer("water_name")) map.setLayerZoomRange("water_name", 3, 24);
}

export function cellsToGeoJSON(cells, metric) {
  return {
    type: "FeatureCollection",
    features: cells.filter((c) => c[metric] !== null && c[metric] !== undefined).map((c) => ({
      type: "Feature",
      properties: {
        v: c[metric],
        lat: c.lat,
        lon: c.lon,
        estimated: c.estimated,
        raw_modis: c.raw_modis,
        raw_terra: c.raw_terra,
        raw_aqua: c.raw_aqua,
        raw_viirs: c.raw_viirs,
        raw_viirs_noaa20: c.raw_viirs_noaa20,
        raw_viirs_noaa21: c.raw_viirs_noaa21,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [c.lon - 0.05, c.lat - 0.05],
            [c.lon + 0.05, c.lat - 0.05],
            [c.lon + 0.05, c.lat + 0.05],
            [c.lon - 0.05, c.lat + 0.05],
            [c.lon - 0.05, c.lat - 0.05],
          ],
        ],
      },
    })),
  };
}

export function featureBounds(feature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (node) => {
    if (typeof node[0] === "number") {
      minX = Math.min(minX, node[0]);
      maxX = Math.max(maxX, node[0]);
      minY = Math.min(minY, node[1]);
      maxY = Math.max(maxY, node[1]);
      return;
    }
    node.forEach(visit);
  };
  visit(feature.geometry.coordinates);
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

export function computeBreaks(cells, metric) {
  let max = 0;
  for (const c of cells) if (typeof c[metric] === "number" && c[metric] > max) max = c[metric];
  const top = Math.max(5, Math.ceil(max / 5) * 5);
  return [1, 2, 3, 4].map((i) => Math.round((top * i * 10) / 5) / 10);
}

export function stepExpression(values, breaks = CELL_BREAKS) {
  return ["step", ["get", "v"], values[0], breaks[0], values[1], breaks[1], values[2], breaks[2], values[3], breaks[3], values[4]];
}

export function cellPaint(breaks = CELL_BREAKS) {
  return {
    fillColor: stepExpression(CELL_COLORS, breaks),
    fillOpacity: ["interpolate", ["linear"], ["zoom"], 3, 0.8, 6, 0.9, 9, 0.96],
    lineWidth: ["interpolate", ["linear"], ["zoom"], 5.5, 0, 8, stepExpression(CELL_OUTLINE_WIDTHS, breaks)],
  };
}

export function mapPadding(map) {
  const el = map?.getContainer?.();
  const w = el?.clientWidth ?? 800;
  const h = el?.clientHeight ?? 600;
  let top = w < 640 ? Math.min(60, h * 0.18) : Math.min(72, h * 0.12);
  const bar = el?.closest(".fc-stage")?.querySelector(".fc-overlay-top");
  if (bar && el) {
    const box = el.getBoundingClientRect();
    let used = 0;
    let bottom = 0;
    for (const child of bar.querySelectorAll(":scope > *")) {
      const r = child.getBoundingClientRect();
      used += r.width;
      bottom = Math.max(bottom, r.bottom - box.top);
    }
    if (used > w * 0.85) top = Math.min(Math.max(top, bottom + 12), h * 0.3);
  }
  if (w < 640) return { top, bottom: Math.min(36, h * 0.1), left: 16, right: 16 };
  return { top, bottom: Math.min(64, h * 0.1), left: 40, right: 64 };
}
