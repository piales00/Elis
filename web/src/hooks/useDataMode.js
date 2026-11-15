import { useSyncExternalStore } from "react";
import { getDataMode, subscribeDataMode } from "../data/client.js";

export function useDataMode() {
  return useSyncExternalStore(subscribeDataMode, getDataMode, getDataMode);
}
