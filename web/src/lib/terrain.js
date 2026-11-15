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
        attribution: "Terrain: Mapzen/AWS Terrain Tiles",
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
    map.setTerrain({ source: "explore-terrain", exaggeration: 1.5 });
    if (typeof map.setSky === "function") map.setSky({ "sky-color": "#122b32", "horizon-color": "#718a87", "fog-color": "#233e39", "fog-ground-blend": 0.25 });
  } else {
    map.setTerrain(null);
    if (typeof map.setSky === "function") map.setSky(undefined);
    if (map.getLayer("explore-hillshade")) map.removeLayer("explore-hillshade");
    if (map.getSource("explore-terrain")) map.removeSource("explore-terrain");
  }
}
