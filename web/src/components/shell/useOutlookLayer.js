import { useEffect, useMemo, useRef } from "react";
import { chanceHigh, findUnit, OUTLOOK_STEPS } from "../../lib/forecast.js";

export const OUTLOOK_MAP_COLORS = ["#3a2f5c", "#5b4592", "#8366c4", "#b79ced", "#e4d8ff"];
const LAYERS = ["outlook-fill", "outlook-none", "outlook-line", "outlook-selected"];

function hatchImage() {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const on = (x + y) % size < 2;
      data[i] = on ? 124 : 40;
      data[i + 1] = on ? 140 : 50;
      data[i + 2] = on ? 163 : 66;
      data[i + 3] = on ? 200 : 110;
    }
  }
  return { width: size, height: size, data };
}

function firstSymbol(map) {
  return map.getStyle().layers.find((l) => l.type === "symbol")?.id;
}

export function useOutlookLayer(map, { departments, forecast, active, selected, onSelect, describe }) {
  const live = useRef({});
  live.current = { onSelect, describe };
  const popup = useRef(null);

  const data = useMemo(() => {
    if (!departments || !forecast) return null;
    return {
      type: "FeatureCollection",
      features: departments.features.map((f) => {
        const unit = findUnit(forecast, f.properties.id);
        const p = chanceHigh(unit);
        return { ...f, properties: { id: f.properties.id, name: f.properties.name, p: p === null ? -1 : p, method: unit?.method ?? "" } };
      }),
    };
  }, [departments, forecast]);

  useEffect(() => {
    if (!map || !data) return;
    if (map.getSource("outlook")) {
      map.getSource("outlook").setData(data);
      return;
    }
    if (!map.hasImage("fc-hatch")) map.addImage("fc-hatch", hatchImage(), { pixelRatio: 2 });
    const before = firstSymbol(map);
    map.addSource("outlook", { type: "geojson", data });
    const [a, b, c, d] = OUTLOOK_STEPS;
    const [c0, c1, c2, c3, c4] = OUTLOOK_MAP_COLORS;
    map.addLayer(
      {
        id: "outlook-fill",
        type: "fill",
        source: "outlook",
        filter: [">=", ["get", "p"], 0],
        layout: { visibility: "none" },
        paint: { "fill-color": ["step", ["get", "p"], c0, a, c1, b, c2, c, c3, d, c4], "fill-opacity": 0.82 },
      },
      before,
    );
    map.addLayer(
      { id: "outlook-none", type: "fill", source: "outlook", filter: ["<", ["get", "p"], 0], layout: { visibility: "none" }, paint: { "fill-pattern": "fc-hatch" } },
      before,
    );
    map.addLayer(
      { id: "outlook-line", type: "line", source: "outlook", layout: { visibility: "none" }, paint: { "line-color": "#090e15", "line-width": 0.9 } },
      before,
    );
    map.addLayer(
      {
        id: "outlook-selected",
        type: "line",
        source: "outlook",
        filter: ["==", ["get", "id"], ""],
        layout: { visibility: "none" },
        paint: { "line-color": "#ffffff", "line-width": 2.2 },
      },
      before,
    );
    import("maplibre-gl").then((m) => {
      popup.current = new m.Popup({ closeButton: false, closeOnClick: false, maxWidth: "260px" });
    });
    const over = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const node = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = f.properties.name;
      const line = document.createElement("div");
      line.textContent = live.current.describe(f.properties);
      node.append(title, line);
      popup.current?.setLngLat(e.lngLat).setDOMContent(node).addTo(map);
    };
    const out = () => {
      map.getCanvas().style.cursor = "";
      popup.current?.remove();
    };
    const click = (e) => {
      const f = e.features?.[0];
      if (f) live.current.onSelect(f.properties.id);
    };
    for (const id of ["outlook-fill", "outlook-none"]) {
      map.on("mousemove", id, over);
      map.on("mouseleave", id, out);
      map.on("click", id, click);
    }
  }, [map, data]);

  useEffect(() => {
    if (!map || !map.getLayer("outlook-fill")) return;
    for (const id of LAYERS) map.setLayoutProperty(id, "visibility", active ? "visible" : "none");
    if (!active) popup.current?.remove();
  }, [map, data, active]);

  useEffect(() => {
    if (!map || !map.getLayer("outlook-selected")) return;
    map.setFilter("outlook-selected", ["==", ["get", "id"], selected ?? ""]);
  }, [map, data, selected]);
}
