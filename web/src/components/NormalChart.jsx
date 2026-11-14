import { useEffect, useMemo, useState } from "react";
import { FIRST_YEAR } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useElementWidth } from "../lib/hooks.js";
import { monthSlots, seriesMax, slotState } from "../lib/series.js";
import SlotDetails, { CLASS_GLYPH } from "./SlotDetails.jsx";
import YearStepper from "./YearStepper.jsx";

const H = 300;
const MT = 20;
const MB = 62;
const REFERENCE_START = 2003;
const CLASS_COLOR = { low: "var(--sat)", normal: "var(--muted)", high: "var(--amber)", very_high: "#f08a6a" };

function Swatch({ children, label }) {
  return (
    <li className="flex items-center gap-2">
      <svg width="30" height="16" aria-hidden="true" className="shrink-0">
        {children}
      </svg>
      <span>{label}</span>
    </li>
  );
}

export default function NormalChart({ series, region, period, onSelectPeriod }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(period.month);

  useEffect(() => {
    setCursor(period.month);
  }, [period.month, period.year]);

  const slots = useMemo(() => monthSlots(series, period.year), [series, period.year]);
  const max = useMemo(
    () =>
      seriesMax(
        series.filter((r) => r.year === period.year),
        ["est_high", "hist_median"],
      ),
    [series, period.year],
  );
  const ml = width < 520 ? 38 : 50;
  const mr = 8;
  const slotW = Math.max((width - ml - mr) / 12, 1);
  const plotH = H - MT - MB;
  const x = (month) => ml + (month - 0.5) * slotW;
  const y = (v) => MT + plotH - (Math.min(v, max) / max) * plotH;
  const barW = Math.min(slotW * 0.6, 44);
  const hasYear = slots.some((s) => s.row);
  const hasRef = (row) => row && row.hist_median !== null && row.hist_median !== undefined;
  const fmtCompact = (v) => formatNumber(v, { notation: "compact" });

  const activeMonth = hover ?? (focused ? cursor : period.month);
  const active = slots[activeMonth - 1];
  const sel = slots[period.month - 1];

  const medianRuns = [];
  let run = [];
  for (const { month, row } of slots) {
    if (hasRef(row)) run.push([month, row.hist_median]);
    else {
      if (run.length) medianRuns.push(run);
      run = [];
    }
  }
  if (run.length) medianRuns.push(run);

  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - ml;
    setHover(px >= 0 && px <= slotW * 12 ? Math.floor(px / slotW) + 1 : null);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") setCursor((c) => (c === 12 ? 1 : c + 1));
    else if (e.key === "ArrowLeft") setCursor((c) => (c === 1 ? 12 : c - 1));
    else if (e.key === "Enter" || e.key === " ") onSelectPeriod({ year: period.year, month: cursor });
    else return;
    setHover(null);
    e.preventDefault();
  };

  const label = `${t(`month.${period.month}`)} ${period.year}`;
  const cls = sel.row?.anomaly_class ? t(`anomaly.${sel.row.anomaly_class}`) : t("series.na");
  let summary;
  if (!sel.row) summary = t("normal.summary.none", { label });
  else if (sel.row.is_forecast) summary = t("normal.summary.forecast", { label, class: cls });
  else if (!hasRef(sel.row) || !sel.row.anomaly_class) summary = t("normal.summary.noRef", { label });
  else summary = t("normal.summary.observed", { label, class: cls });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className={`m-0 max-w-[58ch] font-head text-xl font-bold ${sel.row?.is_forecast ? "text-forecast" : ""}`}>
          {summary}
        </p>
        <YearStepper year={period.year} onChange={(year) => onSelectPeriod({ year, month: period.month })} />
      </div>

      {period.year < REFERENCE_START && period.year >= FIRST_YEAR && <p className="card-soft mb-4 mt-0 p-3 text-sm text-muted">{t("normal.pre2003")}</p>}

      {!hasYear ? (
        <p className="m-0 rounded-2xl border border-dashed border-line p-8 text-center text-muted">{t("normal.empty", { year: period.year })}</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div ref={ref}>
              {width > 0 && (
                <svg
                  key={period.year}
                  width={width}
                  height={H}
                  role="group"
                  tabIndex={0}
                  aria-label={t("normal.aria", { region: t(`region.${region}`), year: period.year })}
                  onPointerMove={onPointerMove}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => hover && onSelectPeriod({ year: period.year, month: hover })}
                  onKeyDown={onKeyDown}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  className="fc-fade block cursor-crosshair rounded-xl"
                >
                  {[0, 0.5, 1].map((f) => (
                    <g key={f}>
                      <line x1={ml} x2={width - mr} y1={y(max * f)} y2={y(max * f)} strokeDasharray={f === 0 ? undefined : "2 5"} style={{ stroke: "var(--line)" }} />
                      <text x={ml - 8} y={y(max * f) + 4} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 11 }}>
                        {fmtCompact(max * f)}
                      </text>
                    </g>
                  ))}

                  {medianRuns.map((r, i) =>
                    r.length > 1 ? (
                      <polyline key={i} points={r.map(([m, v]) => `${x(m)},${y(v)}`).join(" ")} fill="none" strokeDasharray="2 4" strokeLinecap="round" style={{ stroke: "var(--amber)", strokeWidth: 1.6, opacity: 0.8 }} />
                    ) : null,
                  )}

                  {slots.map(({ month, row }) => {
                    const state = slotState(row);
                    const on = month === period.month;
                    const barTop = row ? y(row.estimated) : y(0);
                    return (
                      <g key={month}>
                        {(hover === month || (focused && cursor === month)) && (
                          <rect x={x(month) - slotW / 2 + 2} y={MT} width={slotW - 4} height={plotH} rx="6" strokeDasharray="3 3" style={{ fill: "none", stroke: "var(--muted)" }} />
                        )}
                        {row ? (
                          <>
                            <rect
                              x={x(month) - barW / 2}
                              y={barTop}
                              width={barW}
                              height={Math.max(y(0) - barTop, 1)}
                              rx="3"
                              strokeDasharray={row.is_forecast ? "4 3" : undefined}
                              style={{
                                fill: row.is_forecast ? "none" : "var(--c-est)",
                                fillOpacity: on ? 1 : 0.72,
                                stroke: row.is_forecast ? "var(--forecast)" : on ? "var(--fg)" : "none",
                                strokeWidth: row.is_forecast ? 1.8 : 1.6,
                              }}
                            />
                            <g style={{ stroke: "var(--fg)", strokeWidth: 1.5, opacity: 0.9 }}>
                              <line x1={x(month)} x2={x(month)} y1={y(row.est_low)} y2={y(row.est_high)} />
                              <line x1={x(month) - 4} x2={x(month) + 4} y1={y(row.est_low)} y2={y(row.est_low)} />
                              <line x1={x(month) - 4} x2={x(month) + 4} y1={y(row.est_high)} y2={y(row.est_high)} />
                            </g>
                            {hasRef(row) && (
                              <>
                                <line x1={x(month) - barW / 2 - 4} x2={x(month) + barW / 2 + 4} y1={y(row.hist_median)} y2={y(row.hist_median)} style={{ stroke: "var(--amber)", strokeWidth: 3, strokeLinecap: "round" }} />
                                <circle cx={x(month)} cy={y(row.hist_median)} r="0" />
                              </>
                            )}
                          </>
                        ) : (
                          <line x1={x(month) - barW / 2} x2={x(month) + barW / 2} y1={y(0)} y2={y(0)} strokeDasharray="1 3" style={{ stroke: "var(--none)", strokeWidth: 2 }} />
                        )}
                        {on && <rect x={x(month) - 20} y={y(0) + 7} width="40" height="20" rx="10" style={{ fill: "var(--accent)" }} />}
                        <text x={x(month)} y={y(0) + 17.5} textAnchor="middle" dominantBaseline="central" style={{ fill: on ? "#fff" : "var(--muted)", fontSize: 11.5, fontWeight: on ? 700 : 500 }}>
                          {t(`month.${month}`)}
                        </text>
                        {row?.anomaly_class && hasRef(row) ? (
                          <g>
                            <circle cx={x(month)} cy={y(0) + 44} r="10" style={{ fill: "var(--surface)", stroke: CLASS_COLOR[row.anomaly_class], strokeWidth: on ? 2 : 1 }} />
                            <text x={x(month)} y={y(0) + 44} textAnchor="middle" dominantBaseline="central" style={{ fill: CLASS_COLOR[row.anomaly_class], fontSize: 12, fontWeight: 700 }}>
                              {CLASS_GLYPH[row.anomaly_class]}
                            </text>
                          </g>
                        ) : (
                          state === "unavailable" && (
                            <text x={x(month)} y={y(0) + 44} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--none)", fontSize: 12 }}>
                              ○
                            </text>
                          )
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>

            <div className="mt-5 grid gap-2">
              <ul aria-label={t("chart.legend.title")} className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-muted">
                <Swatch label={t("normal.legend.estimate")}>
                  <rect x="8" y="2" width="14" height="12" rx="3" style={{ fill: "var(--c-est)" }} />
                </Swatch>
                <Swatch label={t("normal.legend.range")}>
                  <g style={{ stroke: "var(--fg)", strokeWidth: 1.5 }}>
                    <line x1="15" x2="15" y1="2" y2="14" />
                    <line x1="11" x2="19" y1="2" y2="2" />
                    <line x1="11" x2="19" y1="14" y2="14" />
                  </g>
                </Swatch>
                <Swatch label={t("normal.legend.median")}>
                  <line x1="4" x2="26" y1="8" y2="8" style={{ stroke: "var(--amber)", strokeWidth: 3, strokeLinecap: "round" }} />
                </Swatch>
                <Swatch label={t("normal.legend.forecast")}>
                  <rect x="8" y="2" width="14" height="12" rx="3" strokeDasharray="4 3" style={{ fill: "none", stroke: "var(--forecast)", strokeWidth: 1.8 }} />
                </Swatch>
                <Swatch label={t("normal.legend.none")}>
                  <line x1="4" x2="26" y1="8" y2="8" strokeDasharray="1 3" style={{ stroke: "var(--none)", strokeWidth: 2 }} />
                </Swatch>
              </ul>
              <p className="m-0 text-xs text-muted">{t("normal.scale", { year: period.year, max: formatNumber(max) })}</p>
              <p className="m-0 text-xs text-muted">
                {t("normal.glyphs")} {t("normal.thresholds")}
              </p>
            </div>
          </div>
          <SlotDetails slot={active} withReference />
        </div>
      )}
    </div>
  );
}
