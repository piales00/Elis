import { useI18n } from "../i18n/I18nProvider.jsx";
import { GROUPS, SENSORS } from "../content/sensors.js";

const GROUP_LABEL = { estimated: "metric.estimated", modis: "metric.raw_modis", viirs: "metric.group.viirs" };

const chip = (on) =>
  `cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-est ${
    on ? "border-fg bg-fg font-semibold text-bg" : "border-line bg-surface hover:bg-bg"
  }`;

export default function SensorSelector({ group, sub, onGroupChange, onSubChange }) {
  const { t } = useI18n();
  const subs = group === "estimated" ? null : SENSORS[group];

  return (
    <div className="grid gap-3">
      <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
        <legend className="float-left mr-3 p-0 text-sm text-muted">{t("map.metric.label")}</legend>
        {GROUPS.map((g) => (
          <label key={g} className={chip(group === g)}>
            <input type="radio" name="metric-group" value={g} checked={group === g} onChange={() => onGroupChange(g)} className="sr-only" />
            {t(GROUP_LABEL[g])}
          </label>
        ))}
      </fieldset>

      {subs && (
        <fieldset className="m-0 grid gap-2 border-0 border-l-2 border-line p-0 pl-4">
          <div className="flex flex-wrap items-center gap-2">
            <legend className="float-left mr-3 p-0 text-sm text-muted">{t(`sensor.sub.${group}`)}</legend>
            {subs.map((s) => (
              <label key={s.id} className={chip(sub === s.id)}>
                <input type="radio" name="metric-sub" value={s.id} checked={sub === s.id} onChange={() => onSubChange(s.id)} className="sr-only" />
                {t(s.labelKey)}
              </label>
            ))}
          </div>
          <p className="m-0 text-xs text-muted">{t(`sensor.note.${group}`)}</p>
        </fieldset>
      )}
    </div>
  );
}
