export const CLASSES = ["low", "normal", "high", "very_high"];
export const OUTLOOK_STEPS = [0.15, 0.3, 0.45, 0.6];
export const OUTLOOK_COLORS = ["var(--p-1)", "var(--p-2)", "var(--p-3)", "var(--p-4)", "var(--p-5)"];

export function findUnit(forecast, id) {
  return forecast?.regions?.find((r) => r.region === id) ?? null;
}

export function chanceHigh(unit) {
  if (!unit?.published || !unit.probabilities) return null;
  return (unit.probabilities.high ?? 0) + (unit.probabilities.very_high ?? 0);
}

export function skillSummary(forecast, lead) {
  const rows = forecast?.metrics?.by_lead ?? [];
  const pick = (level) => rows.find((r) => r.lead === lead && r.level === level) ?? null;
  const macro = pick("macro");
  const dept = pick("department");
  if (!macro || !dept) return null;
  return { lead, macro: [macro.units_with_skill, macro.units], dept: [dept.units_with_skill, dept.units] };
}

export function seasonLabel(forecast, monthName) {
  const months = forecast?.season_months ?? [8, 9, 10];
  return `${monthName(months[0])}–${monthName(months[months.length - 1])} ${forecast?.target_year ?? ""}`.trim();
}
