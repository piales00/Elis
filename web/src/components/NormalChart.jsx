import { useMemo, useState } from "react";
import { FIRST_YEAR } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useElementWidth } from "../lib/hooks.js";
import { monthSlots, seriesMax, slotState } from "../lib/series.js";
import SlotDetails from "./SlotDetails.jsx";
import YearStepper from "./YearStepper.jsx";

const H = 260;
const MT = 14;
const MB = 62;
const GLYPH = { low: "↓", normal: "→", high: "↑", very_high: "⇈" };
const REFERENCE_START = 2003;

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

  const slots = useMemo(() => monthSlots(series, period.year), [series, period.year]);
  const max = useMemo(() => seriesMax(series, ["est_high", "hist_median"]), [series]);
  const compact = width < 520;
  const ml = compact ? 38 : 52;
  const mr = 8;
  const slotW = Math.max((width - ml - mr) / 12, 1);
  const plotH = H - MT - MB;
  const x = (month) => ml + (month - 0.5) * slotW;
  const y = (v) => MT + plotH - (Math.min(v, max) / max) * plotH;
  const barW = Math.min(slotW * 0.5, 34);
  const hasYear = slots.some((s) => s.row);

  const active = slots[(hover ?? cursor) - 1];
  const sel = slots[period.month - 1];
  const hasRef = (row) => row && row.hist_median !== null && row.hist_median !== undefined;
  const compactFmt = { format: (v) => formatNumber(v, { notation: "compact" }) };

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

  let summary;
  const label = `${t(`month.${period.month}`)} ${period.year}`;
  if (!sel.row) summary = t("normal.summary.none", { label });
  else if (sel.row.is_forecast) summary = t("normal.summary.forecast", { label, class: sel.row.anomaly_class ? t(`anomaly.${sel.row.anomaly_class}`) : t("series.na") });
  else if (!hasRef(sel.row) || !sel.row.anomaly_class) summary = t("normal.summary.noRef", { label });
  else summary = t("normal.summary.observed", { label, class: t(`anomaly.${sel.row.anomaly_class}`) });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          className={`m-0 max-w-[60ch] text-lg font-semibold ${sel.row?.is_forecast ? "text-forecast" : ""}`}
        >
          {summary}
        </p>
        <YearStepper year={period.year} onChange={(year) => onSelectPeriod({ year, month: period.month })} />
      </div>

      {period.year < REFERENCE_START && period.year >= FIRST_YEAR && (
        <p className="mb-3 mt-0 rounded-lg border border-line bg-bg p-3 text-sm text-muted">{t("normal.pre2003")}</p>
      )}

      {!hasYear ? (
        <p className="m-0 rounded-xl border border-dashed border-line p-6 text-center text-muted">
          {t("normal.empty", { year: period.year })}
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div ref={ref}>
              {width > 0 && (
                <svg
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
                  className="block cursor-crosshair rounded-lg"
                >
                  {[0, 1, 2, 3, 4].map((i) => {
                    const v = (max / 4) * i;
                    return (
                      <g key={i}>
                        <line x1={ml} x2={width - mr} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} />
                        <text x={ml - 6} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 11 }}>
                          {compactFmt.format(v)}
                        </text>
                      </g>
                    );
                  })}

                  {slots.map(({ month, row }) => {
                    const state = slotState(row);
                    const on = month === period.month;
                    return (
                      <g key={month}>
                        {on && (
                          <rect x={x(month) - slotW / 2} y={MT} width={slotW} height={plotH} style={{ fill: "var(--accent)", opacity: 0.1 }} />
                        )}
                        {(hover === month || (focused && cursor === month)) && (
                          <rect
                            x={x(month) - slotW / 2}
                            y={MT}
                            width={slotW}
                            height={plotH}
                            strokeDasharray="3 2"
                            style={{ fill: "none", stroke: "var(--fg)" }}
                          />
                        )}
                        {row ? (
                          <>
                            <rect
                              x={x(month) - barW / 2}
                              y={y(row.estimated)}
                              width={barW}
                              height={Math.max(y(0) - y(row.estimated), 0)}
                              strokeDasharray={row.is_forecast ? "4 3" : undefined}
                              style={{
                                fill: row.is_forecast ? "none" : "var(--c-est)",
                                fillOpacity: 0.85,
                                stroke: "var(--c-est)",
                                strokeWidth: row.is_forecast ? 1.8 : 0.5,
                              }}
                            />
                            <g style={{ stroke: "var(--fg)", strokeWidth: 1.5 }}>
                              <line x1={x(month)} x2={x(month)} y1={y(row.est_low)} y2={y(row.est_high)} />
                              <line x1={x(month) - 5} x2={x(month) + 5} y1={y(row.est_low)} y2={y(row.est_low)} />
                              <line x1={x(month) - 5} x2={x(month) + 5} y1={y(row.est_high)} y2={y(row.est_high)} />
                            </g>
                            {hasRef(row) && (
                              <line
                                x1={x(month) - slotW * 0.42}
                                x2={x(month) + slotW * 0.42}
                                y1={y(row.hist_median)}
                                y2={y(row.hist_median)}
                                strokeDasharray="6 3"
                                style={{ stroke: "var(--accent)", strokeWidth: 3 }}
                              />
                            )}
                          </>
                        ) : (
                          <line
                            x1={x(month) - barW / 2}
                            x2={x(month) + barW / 2}
                            y1={y(0)}
                            y2={y(0)}
                            strokeDasharray="1 3"
                            style={{ stroke: "var(--muted)", strokeWidth: 2 }}
                          />
                        )}
                        <text
                          x={x(month)}
                          y={y(0) + 16}
                          textAnchor="middle"
                          style={{ fill: on ? "var(--fg)" : "var(--muted)", fontSize: 11, fontWeight: on ? 700 : 400 }}
                        >
                          {t(`month.${month}`)}
                        </text>
                        <text x={x(month)} y={y(0) + 34} textAnchor="middle" style={{ fill: "var(--fg)", fontSize: 13 }}>
                          {row?.anomaly_class && hasRef(row) ? GLYPH[row.anomaly_class] : state === "unavailable" ? "○" : ""}
                        </text>
                        {slotW >= 76 && (
                          <text x={x(month)} y={y(0) + 49} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 10 }}>
                            {row?.anomaly_class && hasRef(row)
                              ? t(`anomaly.${row.anomaly_class}`)
                              : state === "unavailable"
                                ? t("availability.unavailable")
                                : t("normal.refMissing")}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>

            <ul aria-label={t("chart.legend.title")} className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
              <Swatch label={t("normal.legend.estimate")}>
                <rect x="8" y="2" width="14" height="12" style={{ fill: "var(--c-est)", opacity: 0.85 }} />
              </Swatch>
              <Swatch label={t("normal.legend.range")}>
                <g style={{ stroke: "var(--fg)", strokeWidth: 1.5 }}>
                  <line x1="15" x2="15" y1="2" y2="14" />
                  <line x1="10" x2="20" y1="2" y2="2" />
                  <line x1="10" x2="20" y1="14" y2="14" />
                </g>
              </Swatch>
              <Swatch label={t("normal.legend.median")}>
                <line x1="2" x2="28" y1="8" y2="8" strokeDasharray="6 3" style={{ stroke: "var(--accent)", strokeWidth: 3 }} />
              </Swatch>
              <Swatch label={t("normal.legend.forecast")}>
                <rect x="8" y="2" width="14" height="12" strokeDasharray="4 3" style={{ fill: "none", stroke: "var(--c-est)", strokeWidth: 1.8 }} />
              </Swatch>
              <Swatch label={t("normal.legend.none")}>
                <line x1="4" x2="26" y1="8" y2="8" strokeDasharray="1 3" style={{ stroke: "var(--muted)", strokeWidth: 2 }} />
              </Swatch>
            </ul>
            <p className="mb-0 mt-3 text-sm text-muted">{t("normal.glyphs")}</p>
            <p className="m-0 text-sm text-muted">{t("normal.thresholds")}</p>
          </div>
          <SlotDetails slot={active} withReference />
        </div>
      )}
    </div>
  );
}
