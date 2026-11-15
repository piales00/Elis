import { useI18n } from "../../i18n/I18nProvider.jsx";
import { daysInMonth } from "../../lib/gibs.js";

const VIEWS = ["cells", "imagery"];
const BASES = ["truecolor", "thermal", "night", "swir"];
const SOURCE_KEYS = { truecolor: "imagery.base.source", swir: "imagery.base.sourceSwir", thermal: "imagery.base.sourceThermal", night: "imagery.base.sourceNight" };

function shiftDay({ year, month, day }, delta) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export default function ImageryControls({
  view,
  onViewChange,
  base,
  onBaseChange,
  date,
  onDateChange,
  raster,
  satellites,
  onSatelliteChange,
  heat,
  onHeatChange,
  minYear,
  maxYear,
  onTrueScale,
  compact = false,
}) {
  const { t } = useI18n();
  const days = Array.from({ length: daysInMonth(date.year, date.month) }, (_, i) => i + 1);
  const step = (delta) => {
    const next = shiftDay(date, delta);
    if (next.year >= minYear && next.year <= maxYear) onDateChange(next);
  };

  return (
    <div className="card grid gap-4 p-4">
      {!compact && <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">{t("imagery.view.label")}</legend>
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <label key={v} className={`chip ${view === v ? "chip-on" : ""}`}>
              <input type="radio" name="map-view" value={v} checked={view === v} onChange={() => onViewChange(v)} className="sr-only" />
              {t(`imagery.view.${v}`)}
            </label>
          ))}
        </div>
      </fieldset>}

      {view === "imagery" && (
        <>
          {!compact && <div className="border-t border-line pt-4">
            <label htmlFor="imagery-day" className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-muted">
              {t("imagery.day.label")}
            </label>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-icon" aria-label={t("imagery.day.prev")} onClick={() => step(-1)}>
                ◀
              </button>
              <select
                id="imagery-day"
                value={date.day}
                onChange={(e) => onDateChange({ ...date, day: Number(e.target.value) })}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm tabular-nums"
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d} {t(`month.${date.month}`)} {date.year}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-icon" aria-label={t("imagery.day.next")} onClick={() => step(1)}>
                ▶
              </button>
            </div>
            <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{t("imagery.day.note")}</p>
          </div>}

          <fieldset className={`m-0 border-0 p-0 ${compact ? "" : "border-t border-line pt-4"}`}>
            <legend className={compact ? "sr-only" : "mb-2 p-0 text-xs font-bold uppercase tracking-[0.12em] text-muted"}>{t("imagery.base.label")}</legend>
            {!compact && <div className="flex flex-wrap gap-2">
              {BASES.map((b) => (
                <label key={b} className={`chip ${base === b ? "chip-on" : ""}`}>
                  <input type="radio" name="imagery-base" value={b} checked={base === b} onChange={() => onBaseChange(b)} className="sr-only" />
                  {t(`imagery.base.${b}`)}
                </label>
              ))}
            </div>}
            <p className="m-0 mt-3 text-sm leading-relaxed">{t("imagery.base.why")}</p>
            {satellites.length > 1 && (
              <div role="radiogroup" aria-label={t("imagery.satellite.label")} className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{t("imagery.satellite.label")}</span>
                {satellites.map((s) => (
                  <label key={s.id} className={`chip ${raster?.id === s.id ? "chip-on" : ""}`}>
                    <input type="radio" name="imagery-satellite" value={s.id} checked={raster?.id === s.id} onChange={() => onSatelliteChange(s.id)} className="sr-only" />
                    {s.pass ? `${s.label} · ${t(`imagery.pass.${s.pass}`)}` : s.label}
                  </label>
                ))}
              </div>
            )}
            <p className="m-0 mt-3 text-xs leading-relaxed text-muted">
              {raster
                ? t(SOURCE_KEYS[base] ?? SOURCE_KEYS.truecolor, { source: raster.pass ? `${raster.label} · ${t(`imagery.pass.${raster.pass}`)}` : raster.label, bands: raster.bands ?? "" })
                : t("imagery.base.none")}
              {raster?.label.startsWith("MODIS") && ` ${t("imagery.satellite.gaps")}`}
            </p>
          </fieldset>

          {!compact && <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={heat} onChange={(e) => onHeatChange(e.target.checked)} />
            {t("imagery.heat.toggle")}
          </label>}

          <button type="button" className="btn-icon justify-self-start px-3 font-medium" onClick={onTrueScale}>
            {t("imagery.trueScale")}
          </button>
          <p className="m-0 text-xs leading-relaxed text-muted">{t("imagery.attribution")}</p>
        </>
      )}
    </div>
  );
}
