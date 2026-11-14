export const CELL_COLORS = ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"];
export const CELL_BREAKS = [5, 10, 15, 20];
export const CELL_OUTLINE_WIDTHS = [0.6, 1, 1.4, 1.8, 2.2];

export function baseStyle(dark) {
  return `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;
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
