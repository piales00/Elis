export const GROUPS = ["estimated", "modis", "viirs"];

export const SENSORS = {
  modis: [
    { id: "all", field: "raw_modis", labelKey: "sensor.modis.all", since: { year: 2000, month: 11 }, supported: true },
    { id: "terra", field: "raw_terra", labelKey: "sensor.terra", since: { year: 2000, month: 11 }, supported: true },
    { id: "aqua", field: "raw_aqua", labelKey: "sensor.aqua", since: { year: 2002, month: 7 }, supported: true },
  ],
  viirs: [
    { id: "all", field: "raw_viirs", labelKey: "sensor.viirs.all", since: { year: 2012, month: 1 }, supported: true },
    { id: "snpp", field: null, labelKey: "sensor.snpp", supported: false },
    { id: "noaa20", field: null, labelKey: "sensor.noaa20", supported: false },
    { id: "noaa21", field: null, labelKey: "sensor.noaa21", supported: false },
  ],
};

export function sensorFor(group, sub) {
  if (group === "estimated") return { field: "estimated", supported: true };
  return SENSORS[group].find((s) => s.id === sub) ?? SENSORS[group][0];
}

export function beforeCoverage(sensor, year, month) {
  if (!sensor.since) return false;
  return year * 12 + month < sensor.since.year * 12 + sensor.since.month;
}
