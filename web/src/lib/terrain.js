import { CELL_COLORS } from "./mapStyle.js";

export const EXPLORE_CAMERA = { center: [-72.5, -13.2], zoom: 9.5, pitch: 65, bearing: -20, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
export const REGION_3D_CAMERAS = {
  peru: { center: [-72.5, -13.2], zoom: 9.2, pitch: 65, bearing: -20, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  amazonia: { center: [-74.5, -8.4], zoom: 9.2, pitch: 65, bearing: -15, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  sierra: { center: [-72.545, -13.163], zoom: 10.6, pitch: 68, bearing: -28, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  costa: { center: [-79.8, -6.8], zoom: 9.3, pitch: 62, bearing: 15, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  cusco: { center: [-72.545, -13.163], zoom: 11.2, pitch: 68, bearing: -30, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  madre_de_dios: { center: [-69.3, -12.6], zoom: 9.5, pitch: 65, bearing: -12, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  ucayali: { center: [-74.53, -8.38], zoom: 9.5, pitch: 65, bearing: -18, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  puno: { center: [-70.02, -15.84], zoom: 9.6, pitch: 64, bearing: -20, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  junin: { center: [-75.2, -11.5], zoom: 9.6, pitch: 65, bearing: -22, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  san_martin: { center: [-76.7, -6.5], zoom: 9.5, pitch: 64, bearing: -15, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  loreto: { center: [-73.25, -3.75], zoom: 9.2, pitch: 62, bearing: -10, padding: { top: 0, bottom: 0, left: 0, right: 0 } },
};
export const SATELLITE_ATTRIBUTION = "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)";

export function addTerrainFire(map) {
  map.addSource("terrain-cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "terrain-fire",
    type: "heatmap",
    source: "terrain-cells",
    layout: { visibility: "none" },
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "v"], 0, 0, 30, 1],
      "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 4, 4, 8, 28, 10, 100, 14, 1500],
      "heatmap-intensity": 3,
      "heatmap-opacity": 0.6,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(123,63,94,0)", 0.15, CELL_COLORS[0], 0.35, CELL_COLORS[1], 0.55, CELL_COLORS[2], 0.75, CELL_COLORS[3], 1, CELL_COLORS[4]],
    },
  }, map.getStyle().layers.find((l) => l.type === "symbol")?.id);
}

export function containsPoint(feature, { lng, lat }) {
  if (!feature) return false;
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i];
      const [px, py] = ring[j];
      if ((y > lat) !== (py > lat) && lng < ((px - x) * (lat - y)) / (py - y) + x) inside = !inside;
    }
    return inside;
  };
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
}

export function setRelief(map, enabled) {
  if (enabled) {
    if (!map.getSource("explore-terrain")) {
      map.addSource("explore-terrain", {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: "Mapzen / AWS Terrain Tiles",
      });
      map.addLayer({
        id: "explore-hillshade",
        type: "hillshade",
        source: "explore-terrain",
        paint: {
          "hillshade-exaggeration": 0.35,
          "hillshade-shadow-color": "#020b08",
          "hillshade-highlight-color": "#779b88",
          "hillshade-accent-color": "#314d40",
        },
      }, "country-fill");
    }
    if (!map.getSource("explore-satellite")) {
      map.addSource("explore-satellite", {
        type: "raster",
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 18,
        attribution: SATELLITE_ATTRIBUTION,
      });
      map.addLayer({
        id: "explore-satellite",
        type: "raster",
        source: "explore-satellite",
        paint: { "raster-saturation": -0.3, "raster-brightness-max": 0.82, "raster-fade-duration": 0 },
      }, "explore-hillshade");
    }
    map.setTerrain({ source: "explore-terrain", exaggeration: 1.5 });
    if (typeof map.setSky === "function") map.setSky({ "sky-color": "#122b32", "horizon-color": "#718a87", "fog-color": "#233e39", "fog-ground-blend": 0.25 });
  } else {
    map.setTerrain(null);
    if (typeof map.setSky === "function") map.setSky(undefined);
    if (map.getLayer("explore-satellite")) map.removeLayer("explore-satellite");
    if (map.getSource("explore-satellite")) map.removeSource("explore-satellite");
    if (map.getLayer("explore-hillshade")) map.removeLayer("explore-hillshade");
    if (map.getSource("explore-terrain")) map.removeSource("explore-terrain");
  }
}
