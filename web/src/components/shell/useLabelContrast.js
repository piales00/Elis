import { useEffect } from "react";
import { tuneBasemap } from "../../lib/mapStyle.js";

const IMAGERY = { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.2 };

export function useLabelContrast(map, onImagery) {
  useEffect(() => {
    if (!map) return;
    if (!onImagery) {
      tuneBasemap(map);
      return;
    }
    for (const layer of map.getStyle().layers) {
      if (layer.type !== "symbol" || !layer.id.startsWith("place_") && layer.id !== "water_name") continue;
      for (const [prop, value] of Object.entries(IMAGERY)) map.setPaintProperty(layer.id, prop, value);
    }
  }, [map, onImagery]);
}
