const source = import.meta.env.VITE_DATA_SOURCE ?? "mock";

if (source !== "mock" && source !== "api") {
  throw new Error(`VITE_DATA_SOURCE must be "mock" or "api", got "${source}"`);
}

export const DATA_SOURCE = source;
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
export const LIVE_FEED_URL = (import.meta.env.VITE_LIVE_FEED_URL ?? "https://raw.githubusercontent.com/piales00/elis-live/main/data/processed/live").replace(/\/$/, "");
export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2026;
export const DEFAULT_PERIOD = { year: 2024, month: 9 };
export const VIIRS_START_YEAR = 2012;
export const DEFAULT_LOCALE = "en";
export const LOCALES = ["en", "es"];
