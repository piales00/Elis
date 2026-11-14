import { useEffect, useMemo, useState } from "react";
import { fireLayers, loadDetections } from "../../lib/gibs.js";

const EMPTY = { status: "idle", modis: [], viirs: [], error: null };

export function useDailyDetections({ date, area, enabled }) {
  const [state, setState] = useState(EMPTY);
  const layers = useMemo(() => fireLayers(date), [date]);

  useEffect(() => {
    if (!enabled || !area) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: null }));
    Promise.all([
      loadDetections(layers.modis, date, area, controller.signal),
      loadDetections(layers.viirs, date, area, controller.signal),
    ])
      .then(([modis, viirs]) => setState({ status: "ready", modis, viirs, error: null }))
      .catch((error) => {
        if (error.name === "AbortError") return;
        setState({ status: "error", modis: [], viirs: [], error });
      });
    return () => controller.abort();
  }, [date, area, enabled, layers]);

  return { ...state, layers };
}
