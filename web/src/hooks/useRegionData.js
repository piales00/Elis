import { useEffect, useState } from "react";
import { getRegions, getSeries, getMethodology } from "../data/client.js";

export function useRegions() {
  const [state, setState] = useState({ status: "loading", error: null, regions: null });

  useEffect(() => {
    let cancelled = false;
    getRegions()
      .then((regions) => {
        if (!cancelled) setState({ status: "ready", error: null, regions });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", error, regions: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const regionIds = state.regions ? state.regions.features.map((f) => f.properties.id) : [];
  return { ...state, regionIds };
}

export function useRegionData(region) {
  const [state, setState] = useState({ status: "loading", error: null });
  const [data, setData] = useState({ series: [], methodology: null });

  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    setState({ status: "loading", error: null });
    Promise.all([getSeries({ region }), getMethodology(region)])
      .then(([series, methodology]) => {
        if (cancelled) return;
        setData({ series, methodology });
        setState({ status: "ready", error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setData({ series: [], methodology: null });
        setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  return { ...state, ...data };
}
