import { useEffect, useState } from "react";
import { getMap, NoDataError } from "../data/client.js";

export function useMapCells({ year, month, region, enabled }) {
  const [state, setState] = useState({ status: "idle", cells: [], error: null });

  useEffect(() => {
    if (!enabled || !region) {
      setState({ status: "idle", cells: [], error: null });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", cells: [], error: null });
    getMap({ year, month, region })
      .then((cells) => {
        if (!cancelled) setState({ status: "ready", cells, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NoDataError) setState({ status: "nodata", cells: [], error: null });
        else setState({ status: "error", cells: [], error });
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, region, enabled]);

  return state;
}
