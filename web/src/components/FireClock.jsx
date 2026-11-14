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
const GLYPH = { observed: "●", forecast: "◐", unavailable: "○" };

function LegendItem({ children, label }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="30" height="16" aria-hidden="true" className="shrink-0">
        {children}
      </svg>
      <span>{label}</span>
    </li>
  );
}

function ClockLegend({ mode, max }) {
  const { t, formatNumber } = useI18n();
  if (mode === "year") {
    return (
      <ul aria-label={t("chart.legend.title")} className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
        <LegendItem label={t("clock.legend.bar")}>
          <rect x="3" y="2" width="24" height="12" style={{ fill: "var(--c-est)", opacity: 0.85 }} />
        </LegendItem>
        <LegendItem label={t("clock.legend.range")}>
          <rect x="3" y="2" width="24" height="12" style={{ fill: "url(#clock-hatch)", stroke: "var(--fg)" }} />
        </LegendItem>
        <LegendItem label={t("clock.legend.forecast")}>
          <rect x="3" y="2" width="24" height="12" strokeDasharray="4 3" style={{ fill: "none", stroke: "var(--c-est)", strokeWidth: 1.8 }} />
        </LegendItem>
        <LegendItem label={t("clock.legend.none")}>
          <rect x="3" y="2" width="24" height="12" strokeDasharray="1 3" style={{ fill: "none", stroke: "var(--muted)" }} />
        </LegendItem>
      </ul>
    );
  }
  const step = max / CELL_COLORS.length;
  return (
    <div className="mt-4 text-sm">
      <p className="m-0 mb-2 font-semibold">{t("clock.legend.scale")}</p>
      <ul aria-label={t("chart.legend.title")} className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
        {CELL_COLORS.map((color, i) => (
          <LegendItem key={color} label={`${formatNumber(Math.round(step * i))}–${formatNumber(Math.round(step * (i + 1)))}`}>
            <rect x="3" y="2" width="24" height="12" style={{ fill: color, stroke: "var(--fg)", strokeWidth: 0.6 }} />
          </LegendItem>
        ))}
        <LegendItem label={t("clock.legend.forecast")}>
          <rect x="3" y="2" width="24" height="12" strokeDasharray="4 3" style={{ fill: "none", stroke: "var(--fg)", strokeWidth: 1.4 }} />
        </LegendItem>
        <LegendItem label={t("clock.legend.none")}>
          <rect x="3" y="2" width="24" height="12" strokeDasharray="1 3" style={{ fill: "none", stroke: "var(--muted)" }} />
        </LegendItem>
      </ul>
    </div>
  );
}

export default function FireClock({ series, region, period, onSelectPeriod }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [mode, setMode] = useState("year");
  const [hover, setHover] = useState(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState({ year: period.year, month: period.month });

  useEffect(() => {
    setCursor({ year: period.year, month: period.month });
  }, [period.year, period.month]);

  const S = Math.max(260, Math.min(width || 0, 540));
  const cx = S / 2;
  const R = S / 2 - 34;
  const r0 = R * 0.2;
  const th = (R - r0) / N_YEARS;
  const max = useMemo(() => seriesMax(series, mode === "year" ? ["estimated", "est_high"] : ["estimated"]), [series, mode]);
  const yearSlots = useMemo(() => monthSlots(series, period.year), [series, period.year]);
  const hasAny = series.length > 0;
  const rv = (v) => r0 + (Math.min(v, max) / max) * (R - r0);
  const colorOf = (v) => CELL_COLORS[Math.min(CELL_COLORS.length - 1, Math.floor((v / max) * CELL_COLORS.length))];
  const slotOf = (year, month) => ({ year, month, row: findRow(series, year, month) });
  const shown = hover ?? slotOf(cursor.year, cursor.month);

  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { deg, r } = pointToPolar(e.clientX - rect.left - cx, e.clientY - rect.top - cx);
    if (r < r0 * 0.85 || r > R + 30) {
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
    const year = Math.min(LAST_YEAR, FIRST_YEAR + Math.floor((r - r0) / th));
    setHover(slotOf(year, month));
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
  const outline = (year, month, style) => {
    const [a0, a1] = monthAngles(month, 0);
    const [r1, r2] = mode === "year" ? [r0, R] : [r0 + (year - FIRST_YEAR) * th, r0 + (year - FIRST_YEAR + 1) * th];
    return <path d={sectorPath(cx, cx, r1, r2, a0, a1)} fill="none" style={style} pointerEvents="none" />;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
          <legend className="float-left mr-3 p-0 text-sm text-muted">{t("clock.mode.label")}</legend>
          {MODES.map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-est ${
                mode === m ? "border-fg bg-fg font-semibold text-bg" : "border-line bg-surface hover:bg-bg"
              }`}
            >
              <input type="radio" name="clock-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
              {t(`clock.mode.${m}`)}
            </label>
          ))}
        </fieldset>
        <YearStepper year={period.year} onChange={(year) => onSelectPeriod({ year, month: period.month })} />
      </div>

      {!hasAny ? (
        <p className="m-0 text-muted">{t("chart.empty")}</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
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
                  className="cursor-crosshair rounded-lg"
                >
                  <defs>
                    <pattern id="clock-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--fg)", strokeWidth: 1.3 }} />
                    </pattern>
                  </defs>

                  {[0.25, 0.5, 0.75, 1].map((f) => (
                    <circle key={f} cx={cx} cy={cx} r={r0 + f * (R - r0)} fill="none" strokeDasharray="2 4" style={{ stroke: "var(--line)" }} />
                  ))}

                  {mode === "year" &&
                    yearSlots.map(({ month, row }) => {
                      const [a0, a1] = monthAngles(month);
                      const state = slotState(row);
                      const [i0, i1] = monthAngles(month, 7);
                      return (
                        <g key={month}>
                          <path
                            d={sectorPath(cx, cx, r0, R, a0, a1)}
                            strokeDasharray={state === "unavailable" ? "1 3" : undefined}
                            style={{ fill: "var(--surface)", stroke: state === "unavailable" ? "var(--muted)" : "var(--line)" }}
                          />
                          {row && (
                            <path
                              d={sectorPath(cx, cx, r0, rv(row.estimated), a0, a1)}
                              strokeDasharray={row.is_forecast ? "5 3" : undefined}
                              style={{
                                fill: row.is_forecast ? "none" : "var(--c-est)",
                                fillOpacity: 0.85,
                                stroke: "var(--c-est)",
                                strokeWidth: row.is_forecast ? 1.8 : 0.5,
                              }}
                            />
                          )}
                          {row && (
                            <path
                              d={sectorPath(cx, cx, rv(row.est_low), rv(row.est_high), i0, i1)}
                              strokeDasharray={row.is_forecast ? "3 2" : undefined}
                              style={{ fill: "url(#clock-hatch)", stroke: "var(--fg)", strokeWidth: 1 }}
                            />
                          )}
                        </g>
                      );
                    })}

                  {mode === "rings" &&
                    series.map((row) => {
                      const [a0, a1] = monthAngles(row.month, 0.6);
                      const rin = r0 + (row.year - FIRST_YEAR) * th;
                      return (
                        <path
                          key={`${row.year}-${row.month}`}
                          d={sectorPath(cx, cx, rin, rin + th - 0.6, a0, a1)}
                          strokeDasharray={row.is_forecast ? "3 2" : undefined}
                          style={{
                            fill: row.is_forecast ? "none" : colorOf(row.estimated),
                            stroke: row.is_forecast ? "var(--fg)" : "var(--surface)",
                            strokeWidth: row.is_forecast ? 1.2 : 0.4,
                          }}
                        />
                      );
                    })}

                  {mode === "rings" &&
                    Array.from({ length: 12 }, (_, i) => {
                      const [x1, y1] = polar(cx, cx, r0, i * 30);
                      const [x2, y2] = polar(cx, cx, R, i * 30);
                      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray="1 3" style={{ stroke: "var(--muted)", opacity: 0.7 }} />;
                    })}

                  {mode === "rings" &&
                    [FIRST_YEAR, 2013, LAST_YEAR].map((y) => (
                      <text
                        key={y}
                        x={cx - 4}
                        y={cx - r0 - (y - FIRST_YEAR) * th - th / 2 + 4}
                        textAnchor="end"
                        style={{ fill: "var(--muted)", fontSize: 10, paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}
                      >
                        {y}
                      </text>
                    ))}

                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const [lx, ly] = polar(cx, cx, R + 18, i * 30 + 15);
                    const state = mode === "year" ? slotState(yearSlots[i].row) : null;
                    const on = m === period.month;
                    return (
                      <text
                        key={m}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ fill: on ? "var(--fg)" : "var(--muted)", fontSize: 11, fontWeight: on ? 700 : 400 }}
                      >
                        {state ? `${GLYPH[state]} ` : ""}
                        {t(`month.${m}`)}
                      </text>
                    );
                  })}

                  {mode === "year" && (
                    <>
                      <text x={cx} y={cx - 2} textAnchor="middle" style={{ fill: "var(--fg)", fontSize: 16, fontWeight: 700 }}>
                        {period.year}
                      </text>
                    </>
                  )}

                  {outline(period.year, period.month, { stroke: "var(--accent)", strokeWidth: 2.5 })}
                  {focused && outline(cursor.year, cursor.month, { stroke: "var(--fg)", strokeWidth: 1.5, strokeDasharray: "3 2" })}
                </svg>
              )}
            </div>
            <ClockLegend mode={mode} max={max} />
            {mode === "year" && <p className="mb-0 mt-3 text-sm text-muted">{t("clock.scale", { max: formatNumber(max) })}</p>}
            <p className="mb-0 mt-3 text-sm text-muted">{t(`clock.hint.${mode}`)}</p>
            <p className="m-0 text-sm text-muted">{t("chart.hint")}</p>
          </div>
          <SlotDetails slot={shown} />
        </div>
      )}
    </div>
  );
}
