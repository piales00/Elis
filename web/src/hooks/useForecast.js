import { useEffect, useState } from "react";
import { getForecast, NoDataError } from "../data/client.js";

export function useForecast() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, error: null });
    getForecast()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: error instanceof NoDataError ? "unavailable" : "error", data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
