export const GROUPS = ["estimated", "modis", "viirs"];

export const SENSORS = {
  modis: [
    { id: "all", field: "raw_modis", labelKey: "sensor.modis.all", since: { year: 2000, month: 11 } },
    { id: "terra", field: "raw_terra", labelKey: "sensor.terra", since: { year: 2000, month: 11 } },
    { id: "aqua", field: "raw_aqua", labelKey: "sensor.aqua", since: { year: 2002, month: 7 } },
  ],
  viirs: [
    { id: "snpp", field: "raw_viirs", labelKey: "sensor.snpp", since: { year: 2012, month: 1 } },
    { id: "noaa20", field: "raw_viirs_noaa20", labelKey: "sensor.noaa20", since: { year: 2018, month: 4 } },
    { id: "noaa21", field: "raw_viirs_noaa21", labelKey: "sensor.noaa21", since: { year: 2023, month: 3 } },
  ],
};

export const DEFAULT_SUB = { estimated: "all", modis: "all", viirs: "snpp" };

export const SNPP_GAP = { year: 2026, month: 11 };

export function sensorFor(group, sub) {
  if (group === "estimated") return { id: "all", field: "estimated" };
  return SENSORS[group].find((s) => s.id === sub) ?? SENSORS[group][0];
}

export function beforeCoverage(sensor, year, month) {
  if (!sensor.since) return false;
  return year * 12 + month < sensor.since.year * 12 + sensor.since.month;
}

export function gapNoteKey(group, sensor, year, month) {
  if (year !== SNPP_GAP.year || month !== SNPP_GAP.month) return null;
  if (group === "estimated") return "sensor.gap.estimated";
  if (group === "viirs" && sensor.id === "snpp") return "sensor.gap.snpp";
  return null;
}
