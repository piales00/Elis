import { useEffect, useMemo, useState } from "react";
import { FIRST_YEAR, LAST_YEAR } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useElementWidth } from "../lib/hooks.js";
import { monthAngles, pointToPolar, polar, sectorPath } from "../lib/polar.js";
import { findRow, monthSlots, seriesMax, slotState } from "../lib/series.js";
import { CELL_COLORS } from "../lib/mapStyle.js";
import SlotDetails from "./SlotDetails.jsx";
import YearStepper from "./YearStepper.jsx";

const N_YEARS = LAST_YEAR - FIRST_YEAR + 1;
const MODES = ["year", "rings"];
const SCALES = ["fit", "common"];
const GLYPH = { observed: "●", forecast: "◐", unavailable: "○" };
const HALO = { paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3 };

function LegendItem({ children, label }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="28" height="16" aria-hidden="true" className="shrink-0">
        {children}
      </svg>
      <span>{label}</span>
    </li>
  );
}

function ClockLegend({ mode, max }) {
  const { t, formatNumber } = useI18n();
  const dashed = { fill: "none", strokeDasharray: "4 3", strokeWidth: 1.6, stroke: "var(--forecast)" };
  const none = (
    <LegendItem label={t("clock.legend.none")}>
      <rect x="2" y="2" width="24" height="12" rx="3" strokeDasharray="1 3" style={{ fill: "none", stroke: "var(--none)" }} />
    </LegendItem>
  );
  const forecast = (
    <LegendItem label={t("clock.legend.forecast")}>
      <rect x="2" y="2" width="24" height="12" rx="3" style={dashed} />
    </LegendItem>
  );
  if (mode === "year") {
    return (
      <ul aria-label={t("chart.legend.title")} className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-muted">
        <LegendItem label={t("clock.legend.bar")}>
          <rect x="4" y="3" width="20" height="10" rx="5" style={{ fill: "var(--c-est)" }} />
        </LegendItem>
        <LegendItem label={t("clock.legend.range")}>
          <line x1="14" x2="14" y1="1" y2="15" strokeWidth="2" style={{ stroke: "var(--fg)" }} />
          <line x1="9" x2="19" y1="1.5" y2="1.5" strokeWidth="2" style={{ stroke: "var(--fg)" }} />
          <line x1="9" x2="19" y1="14.5" y2="14.5" strokeWidth="2" style={{ stroke: "var(--fg)" }} />
        </LegendItem>
        {forecast}
        {none}
      </ul>
    );
  }
  const step = max / CELL_COLORS.length;
  return (
    <div className="grid gap-2 text-xs text-muted">
      <ul aria-label={t("chart.legend.title")} className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
        {CELL_COLORS.map((color, i) => (
          <LegendItem key={color} label={`${formatNumber(Math.round(step * i))}–${formatNumber(Math.round(step * (i + 1)))}`}>
            <rect x="2" y="2" width="24" height="12" rx="3" style={{ fill: color }} />
          </LegendItem>
        ))}
        {forecast}
        {none}
      </ul>
    </div>
  );
}

export default function FireClock({ series, region, period, onSelectPeriod }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [mode, setMode] = useState("year");
  const [scale, setScale] = useState("fit");
  const [spotlight, setSpotlight] = useState(true);
  const [hover, setHover] = useState(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState({ year: period.year, month: period.month });

  useEffect(() => {
    setCursor({ year: period.year, month: period.month });
  }, [period.year, period.month]);

  const S = Math.max(300, Math.min(width || 0, 600));
  const cx = S / 2;
  const R = S / 2 - 46;
  const r0 = R * 0.2;
  const th = (R - r0) / N_YEARS;
  const yearRows = useMemo(() => series.filter((r) => r.year === period.year), [series, period.year]);
  const max = useMemo(() => {
    if (mode === "rings") return seriesMax(series, ["estimated"]);
    return seriesMax(scale === "fit" ? yearRows : series, ["estimated", "est_high"]);
  }, [mode, scale, series, yearRows]);
  const yearSlots = useMemo(() => monthSlots(series, period.year), [series, period.year]);
  const rv = (v) => r0 + (Math.min(v, max) / max) * (R - r0);
  const colorOf = (v) => CELL_COLORS[Math.min(CELL_COLORS.length - 1, Math.floor((v / max) * CELL_COLORS.length))];
  const slotOf = (year, month) => ({ year, month, row: findRow(series, year, month) });
  const shown = hover ?? slotOf(cursor.year, cursor.month);
  const compact = (v) => formatNumber(v, { notation: "compact" });

  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { deg, r } = pointToPolar(e.clientX - rect.left - cx, e.clientY - rect.top - cx);
    if (r < r0 * 0.9 || r > R + 38) {
      setHover(null);
      return;
    }
    const month = Math.floor(deg / 30) + 1;
    if (mode === "year") {
      setHover(slotOf(period.year, month));
      return;
    }
    if (r < r0 || r > R) {
      setHover(null);
      return;
    }
    setHover(slotOf(Math.min(LAST_YEAR, FIRST_YEAR + Math.floor((r - r0) / th)), month));
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") setCursor((c) => ({ ...c, month: c.month === 12 ? 1 : c.month + 1 }));
    else if (e.key === "ArrowLeft") setCursor((c) => ({ ...c, month: c.month === 1 ? 12 : c.month - 1 }));
    else if (e.key === "ArrowUp" && cursor.year < LAST_YEAR) onSelectPeriod({ year: cursor.year + 1, month: cursor.month });
    else if (e.key === "ArrowDown" && cursor.year > FIRST_YEAR) onSelectPeriod({ year: cursor.year - 1, month: cursor.month });
    else if (e.key === "Enter" || e.key === " ") onSelectPeriod({ ...cursor });
    else return;
    setHover(null);
    e.preventDefault();
  };

  const select = () => hover && onSelectPeriod({ year: hover.year, month: hover.month });
  const wedge = (year, month, style) => {
    const [a0, a1] = monthAngles(month, 0.6);
    const [r1, r2] = mode === "year" ? [r0, R] : [r0 + (year - FIRST_YEAR) * th, r0 + (year - FIRST_YEAR + 1) * th];
    return <path d={sectorPath(cx, cx, r1, r2, a0, a1)} style={style} pointerEvents="none" />;
  };
  const ringYears = [FIRST_YEAR, 2010, 2020];
  const selMid = (period.month - 1) * 30 + 15;
  const selRow = yearSlots[period.month - 1].row;

  return (
    <div className="@container">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
            <legend className="sr-only">{t("clock.mode.label")}</legend>
            {MODES.map((m) => (
              <label key={m} className={`chip ${mode === m ? "chip-on" : ""}`}>
                <input type="radio" name="clock-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                {t(`clock.mode.${m}`)}
              </label>
            ))}
          </fieldset>
          {mode === "year" && (
            <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
              <legend className="sr-only">{t("clock.scaleMode.label")}</legend>
              {SCALES.map((m) => (
                <label key={m} className={`chip !text-xs ${scale === m ? "!border-fg font-semibold" : ""}`}>
                  <input type="radio" name="clock-scale" value={m} checked={scale === m} onChange={() => setScale(m)} className="sr-only" />
                  {t(`clock.scaleMode.${m}`)}
                </label>
              ))}
            </fieldset>
          )}
          {mode === "rings" && (
            <button type="button" aria-pressed={spotlight} onClick={() => setSpotlight((v) => !v)} className={`chip !text-xs ${spotlight ? "!border-fg font-semibold" : ""}`}>
              {t("clock.highlight")}
            </button>
          )}
        </div>
        <YearStepper year={period.year} onChange={(year) => onSelectPeriod({ year, month: period.month })} />
      </div>

      {series.length === 0 ? (
        <p className="m-0 text-muted">{t("chart.empty")}</p>
      ) : (
        <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div ref={ref} className="flex justify-center">
              {width > 0 && (
                <svg
                  width={S}
                  height={S}
                  role="group"
                  tabIndex={0}
                  aria-label={t("clock.aria", { region: t(`region.${region}`), view: t(`clock.mode.${mode}`) })}
                  onPointerMove={onPointerMove}
                  onPointerLeave={() => setHover(null)}
                  onClick={select}
                  onKeyDown={onKeyDown}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  className="cursor-crosshair rounded-2xl"
                >
                  {mode === "year" && (
                    <>
                      <path d={sectorPath(cx, cx, r0, R, (period.month - 1) * 30, period.month * 30)} style={{ fill: "var(--accent)", opacity: 0.1 }} />
                      {[1 / 3, 2 / 3, 1].map((f) => (
                        <g key={f}>
                          <circle cx={cx} cy={cx} r={r0 + f * (R - r0)} fill="none" strokeDasharray={f === 1 ? undefined : "2 5"} style={{ stroke: "var(--line)" }} />
                          <text x={cx - 4} y={cx - (r0 + f * (R - r0)) + 3.5} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 10, ...HALO }}>
                            {compact(f * max)}
                          </text>
                        </g>
                      ))}
                      <circle cx={cx} cy={cx} r={r0} style={{ fill: "var(--bg)", stroke: "var(--line)" }} />
                      <g key={`${period.year}-${scale}`} className="fc-fade">
                        {yearSlots.map(({ month, row }) => {
                          const mid = (month - 1) * 30 + 15;
                          const [a0, a1] = [mid - 6.5, mid + 6.5];
                          const [b0, b1] = [mid - 2.6, mid + 2.6];
                          const state = slotState(row);
                          const [sx1, sy1] = polar(cx, cx, r0, mid);
                          const [sx2, sy2] = polar(cx, cx, R, mid);
                          return (
                            <g key={month}>
                              <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} strokeDasharray={state === "unavailable" ? "1 4" : undefined} style={{ stroke: state === "unavailable" ? "var(--none)" : "var(--line)", opacity: state === "unavailable" ? 0.8 : 0.9 }} />
                              {row && (
                                <>
                                  <path
                                    d={sectorPath(cx, cx, r0 + 2, Math.max(rv(row.estimated), r0 + 4), a0, a1)}
                                    strokeDasharray={row.is_forecast ? "4 3" : undefined}
                                    strokeLinejoin="round"
                                    style={{
                                      fill: row.is_forecast ? "none" : "var(--c-est)",
                                      stroke: row.is_forecast ? "var(--forecast)" : "var(--c-est)",
                                      strokeWidth: row.is_forecast ? 1.8 : 2,
                                    }}
                                  />
                                  <path
                                    d={sectorPath(cx, cx, rv(row.est_low), Math.max(rv(row.est_high), rv(row.est_low) + 1.5), mid - 8.5, mid + 8.5)}
                                    strokeDasharray={row.is_forecast ? "3 2" : undefined}
                                    style={{ fill: row.is_forecast ? "none" : "var(--fg)", fillOpacity: 0.16, stroke: "var(--fg)", strokeWidth: 1, strokeOpacity: 0.7 }}
                                  />
                                  <path d={sectorPath(cx, cx, rv(row.est_low) - 0.6, rv(row.est_low) + 0.6, b0 - 3, b1 + 3)} style={{ fill: "var(--fg)" }} />
                                  <path d={sectorPath(cx, cx, rv(row.est_high) - 0.6, rv(row.est_high) + 0.6, b0 - 3, b1 + 3)} style={{ fill: "var(--fg)" }} />
                                </>
                              )}
                            </g>
                          );
                        })}
                        {selRow && (
                          <text
                            x={polar(cx, cx, Math.max(rv(selRow.est_high), rv(selRow.estimated)) + 14, selMid)[0]}
                            y={polar(cx, cx, Math.max(rv(selRow.est_high), rv(selRow.estimated)) + 14, selMid)[1]}
                            textAnchor="middle"
                            dominantBaseline="central"
                            style={{ fill: "var(--fg)", fontSize: 12, fontWeight: 700, ...HALO }}
                          >
                            {compact(selRow.estimated)}
                          </text>
                        )}
                      </g>
                    </>
                  )}

                  {mode === "rings" && (
                    <g>
                      <circle cx={cx} cy={cx} r={R + 3} style={{ fill: "var(--bg)", stroke: "var(--line)" }} />
                      {series.map((row) => {
                        const [a0, a1] = monthAngles(row.month, 0.7);
                        const rin = r0 + (row.year - FIRST_YEAR) * th;
                        const dim = spotlight && row.year !== period.year;
                        return (
                          <path
                            key={`${row.year}-${row.month}`}
                            d={sectorPath(cx, cx, rin + 0.2, rin + th - 0.2, a0, a1)}
                            strokeDasharray={row.is_forecast ? "3 2" : undefined}
                            style={{
                              fill: row.is_forecast ? "none" : colorOf(row.estimated),
                              stroke: row.is_forecast ? "var(--forecast)" : "none",
                              strokeWidth: 1,
                              opacity: dim ? 0.3 : 1,
                              transition: "opacity 0.25s",
                            }}
                          />
                        );
                      })}
                      {Array.from({ length: 12 }, (_, i) => {
                        const [x1, y1] = polar(cx, cx, r0, i * 30);
                        const [x2, y2] = polar(cx, cx, R + 3, i * 30);
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: "var(--bg)", strokeWidth: 1.5 }} />;
                      })}
                      <circle cx={cx} cy={cx} r={r0 + (period.year - FIRST_YEAR) * th} fill="none" style={{ stroke: "var(--fg)" }} />
                      <circle cx={cx} cy={cx} r={r0 + (period.year - FIRST_YEAR + 1) * th} fill="none" style={{ stroke: "var(--fg)" }} />
                      {ringYears.map((y) => (
                        <text key={y} x={cx - 5} y={cx - r0 - (y - FIRST_YEAR) * th - th / 2 + 3.5} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 10, ...HALO }}>
                          {y}
                        </text>
                      ))}
                      <g>
                        <rect x={cx - 38} y={cx - r0 - (period.year - FIRST_YEAR) * th - th / 2 - 9} width="33" height="18" rx="9" style={{ fill: "var(--fg)" }} />
                        <text x={cx - 21.5} y={cx - r0 - (period.year - FIRST_YEAR) * th - th / 2 + 0.5} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--bg)", fontSize: 10.5, fontWeight: 700 }}>
                          {period.year}
                        </text>
                      </g>
                      <circle cx={cx} cy={cx} r={r0} style={{ fill: "var(--bg)", stroke: "var(--line)" }} />
                    </g>
                  )}

                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const [lx, ly] = polar(cx, cx, R + 26, i * 30 + 15);
                    const state = mode === "year" ? slotState(yearSlots[i].row) : null;
                    const on = m === period.month;
                    return (
                      <g key={m}>
                        {on && <rect x={lx - 27} y={ly - 11} width="54" height="22" rx="11" style={{ fill: "var(--accent)" }} />}
                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" style={{ fill: on ? "#fff" : "var(--muted)", fontSize: 11.5, fontWeight: on ? 700 : 500 }}>
                          {`${state ? `${GLYPH[state]} ` : ""}${t(`month.${m}`)}`}
                        </text>
                      </g>
                    );
                  })}

                  <text x={cx} y={cx - 3} textAnchor="middle" style={{ fill: "var(--fg)", fontSize: Math.round(S * 0.052), fontWeight: 800, fontFamily: "var(--font-head)" }}>
                    {period.year}
                  </text>
                  <text x={cx} y={cx + 14} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>
                    {t(`month.${period.month}`)}
                  </text>

                  {mode === "rings" && wedge(period.year, period.month, { fill: "none", stroke: "var(--accent-text)", strokeWidth: 2.4 })}
                  {focused && wedge(cursor.year, cursor.month, { fill: "none", stroke: "var(--fg)", strokeWidth: 1.5, strokeDasharray: "3 2" })}
                </svg>
              )}
            </div>
            <div className="mt-5 grid gap-2">
              <ClockLegend mode={mode} max={max} />
              <p className="m-0 text-xs text-muted">
                {mode === "year" ? t(`clock.scale.${scale}`, { max: formatNumber(max) }) : t("clock.scale.rings", { max: formatNumber(max) })}
              </p>
              <p className="m-0 text-xs text-muted">
                {t(`clock.hint.${mode}`)} {t("chart.hint")}
              </p>
            </div>
          </div>
          <SlotDetails slot={shown} />
        </div>
      )}
    </div>
  );
}
