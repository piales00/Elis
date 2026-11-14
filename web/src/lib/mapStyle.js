export const CELL_COLORS = ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"];
export const CELL_BREAKS = [5, 10, 15, 20];
export const CELL_OUTLINE_WIDTHS = [0.6, 1, 1.4, 1.8, 2.2];

export function baseStyle(dark) {
  return `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
}

export function cellsToGeoJSON(cells, metric) {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      properties: {
        v: c[metric] ?? 0,
        lat: c.lat,
        lon: c.lon,
        estimated: c.estimated,
        raw_modis: c.raw_modis,
        raw_viirs: c.raw_viirs,
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
  for (const ring of feature.geometry.coordinates) {
    for (const [lon, lat] of ring) {
      minX = Math.min(minX, lon);
      maxX = Math.max(maxX, lon);
      minY = Math.min(minY, lat);
      maxY = Math.max(maxY, lat);
    }
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

export function stepExpression(values) {
  return ["step", ["get", "v"], values[0], CELL_BREAKS[0], values[1], CELL_BREAKS[1], values[2], CELL_BREAKS[2], values[3], CELL_BREAKS[3], values[4]];
}
