import { useI18n } from "../i18n/I18nProvider.jsx";
import { GROUPS, SENSORS } from "../content/sensors.js";

const GROUP_LABEL = { estimated: "metric.estimated", modis: "metric.raw_modis", viirs: "metric.group.viirs" };

export default function SensorSelector({ group, sub, onGroupChange, onSubChange }) {
  const { t } = useI18n();
  const subs = group === "estimated" ? null : SENSORS[group];

  return (
    <div className="card grid gap-4 p-4">
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">{t("map.metric.label")}</legend>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <label key={g} className={`chip ${group === g ? "chip-on" : ""}`}>
              <input type="radio" name="metric-group" value={g} checked={group === g} onChange={() => onGroupChange(g)} className="sr-only" />
              {t(GROUP_LABEL[g])}
            </label>
          ))}
        </div>
      </fieldset>

      {subs && (
        <fieldset className="m-0 border-0 border-t border-line p-0 pt-4">
          <legend className="mb-2 p-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">{t(`sensor.sub.${group}`)}</legend>
          <div className="flex flex-wrap gap-2">
            {subs.map((s) => (
              <label key={s.id} className={`chip ${sub === s.id ? "chip-on" : ""}`}>
                <input type="radio" name="metric-sub" value={s.id} checked={sub === s.id} onChange={() => onSubChange(s.id)} className="sr-only" />
                {t(s.labelKey)}
              </label>
            ))}
          </div>
          <p className="m-0 mt-3 text-xs leading-relaxed text-muted">{t(`sensor.note.${group}`)}</p>
        </fieldset>
      )}
    </div>
  );
}
