import { useEffect } from "react";

const IMAGERY = { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.2 };
const VECTOR = { "text-color": "#6b7b92", "text-halo-color": "#0b111b", "text-halo-width": 1.4 };

export function useLabelContrast(map, onImagery) {
  useEffect(() => {
    if (!map) return;
    const paint = onImagery ? IMAGERY : VECTOR;
    for (const layer of map.getStyle().layers) {
      if (layer.type !== "symbol" || !layer.id.startsWith("place_") && layer.id !== "water_name") continue;
      for (const [prop, value] of Object.entries(paint)) map.setPaintProperty(layer.id, prop, value);
    }
  }, [map, onImagery]);
}
