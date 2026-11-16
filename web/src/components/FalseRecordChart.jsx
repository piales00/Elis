import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useElementWidth } from "../lib/hooks.js";
import { FIRST_YEAR, LAST_YEAR, VIIRS_START_YEAR } from "../config.js";
import { monthIndex } from "../lib/period.js";

const N = (LAST_YEAR - FIRST_YEAR + 1) * 12;
const PANEL_H = 232;
const MT = 30;
const MB = 26;
const MR = 14;
const SERIES = {
  raw: { color: "var(--c-raw)", shape: "triangle" },
  modis: { color: "var(--c-modis)", shape: "circle" },
  viirs: { color: "var(--c-viirs)", shape: "square" },
  estimated: { color: "var(--c-est)", shape: "diamond" },
};
const HALO = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 };

function niceMax(value) {
  if (!(value > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((n) => f <= n);
  return nice * exp;
}

function buildRuns(rows, pick) {
  const runs = [];
  let current = null;
  for (const row of rows) {
    if (pick(row) === null || pick(row) === undefined) {
      current = null;
      continue;
    }
    if (current && row.idx === current.last + 1 && row.is_forecast === current.forecast) {
      current.rows.push(row);
      current.last = row.idx;
    } else {
      current = { rows: [row], last: row.idx, forecast: row.is_forecast };
      runs.push(current);
    }
  }
  return runs;
}

function Marker({ shape, x, y, color, hollow, big }) {
  const k = big ? 1.5 : 1;
  const style = { fill: hollow ? "var(--surface)" : color, stroke: color, strokeWidth: 1.6 };
  if (shape === "square") return <rect x={x - 3.5 * k} y={y - 3.5 * k} width={7 * k} height={7 * k} style={style} />;
  if (shape === "diamond") return <polygon points={`${x},${y - 5 * k} ${x + 5 * k},${y} ${x},${y + 5 * k} ${x - 5 * k},${y}`} style={style} />;
  if (shape === "triangle") return <polygon points={`${x},${y - 5 * k} ${x + 5 * k},${y + 4 * k} ${x - 5 * k},${y + 4 * k}`} style={style} />;
  return <circle cx={x} cy={y} r={4 * k} style={style} />;
}

function Series({ rows, pick, x, y, name, withBand, dense, dim, selectedIdx, strong, area }) {
  const { color, shape } = SERIES[name];
  const runs = buildRuns(rows, pick);
  const isolated = new Set(runs.filter((run) => run.rows.length === 1).map((run) => run.rows[0].idx));
  const selected = selectedIdx !== null ? rows.find((r) => r.idx === selectedIdx && pick(r) !== null && pick(r) !== undefined) : null;
  return (
    <g style={{ opacity: dim ? 0.5 : 1, transition: "opacity 0.2s" }}>
      {runs.map((run) => {
        const pts = run.rows.map((r) => `${x(r.idx)},${y(pick(r))}`);
        return (
          <g key={`${run.rows[0].idx}-${run.forecast}`}>
            {withBand && run.rows.length > 1 && (
              <path
                d={`M${run.rows.map((r) => `${x(r.idx)},${y(r.est_high)}`).join("L")}L${[...run.rows]
                  .reverse()
                  .map((r) => `${x(r.idx)},${y(r.est_low)}`)
                  .join("L")}Z`}
                style={{ fill: color, opacity: run.forecast ? 0.1 : 0.2 }}
              />
            )}
            {area && run.rows.length > 1 && (
              <path
                d={`M${x(run.rows[0].idx)},${y(0)}L${pts.join("L")}L${x(run.rows[run.rows.length - 1].idx)},${y(0)}Z`}
                style={{ fill: run.forecast ? "var(--forecast)" : color, opacity: strong ? 0.2 : 0.11 }}
              />
            )}
            {run.rows.length > 1 && (
              <polyline
                points={pts.join(" ")}
                fill="none"
                strokeWidth={strong ? 2.8 : dense ? 1.7 : 2}
                strokeLinejoin="round"
                strokeDasharray={run.forecast ? "5 4" : undefined}
                style={{ stroke: run.forecast ? "var(--forecast)" : color }}
              />
            )}
          </g>
        );
      })}
      {rows.map((r) => {
        if (pick(r) === null || pick(r) === undefined) return null;
        if (dense && !r.is_forecast && !isolated.has(r.idx)) return null;
        return (
          <g key={r.idx}>
            {withBand && (
              <line x1={x(r.idx)} x2={x(r.idx)} y1={y(r.est_low)} y2={y(r.est_high)} strokeWidth="1.5" style={{ stroke: color, opacity: 0.7 }} />
            )}
            <Marker shape={shape} x={x(r.idx)} y={y(pick(r))} color={r.is_forecast ? "var(--forecast)" : color} hollow={r.is_forecast} />
          </g>
        );
      })}
      {selected && <Marker shape={shape} x={x(selected.idx)} y={y(pick(selected))} color={color} hollow={false} big />}
    </g>
  );
}

function Frame({ width, ml, yMax, x, periodIdx, cursorIdx, showEra, children }) {
  const { t, formatNumber } = useI18n();
  const plotW = width - ml - MR;
  const plotH = PANEL_H - MT - MB;
  const y = (v) => MT + plotH - (v / yMax) * plotH;
  const step = width < 560 ? 4 : 2;
  const years = [];
  for (let yr = FIRST_YEAR; yr <= LAST_YEAR; yr += step) years.push(yr);
  const xEra = x(monthIndex(VIIRS_START_YEAR, 1) - 0.5);
  const xEnd = ml + plotW;
  const pillText = t("chart.era.marker");
  const pillW = pillText.length * 6.4 + 18;

  return (
    <svg width={width} height={PANEL_H} aria-hidden="true" className="block">
      <rect x={ml} y={MT} width={xEra - ml} height={plotH} style={{ fill: "var(--bg)", opacity: 0.35 }} />
      <rect x={xEra} y={MT} width={xEnd - xEra} height={plotH} style={{ fill: "var(--era-fill)" }} />
      {[0, 1, 2, 3].map((i) => {
        const v = (yMax / 3) * i;
        return (
          <g key={i}>
            <line x1={ml} x2={xEnd} y1={y(v)} y2={y(v)} strokeDasharray={i === 0 ? undefined : "2 5"} style={{ stroke: "var(--line)" }} />
            <text x={ml - 8} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 11 }}>
              {formatNumber(v, { notation: "compact" })}
            </text>
          </g>
        );
      })}
      {years.map((yr) => (
        <text key={yr} x={x(monthIndex(yr, 1))} y={PANEL_H - 7} textAnchor="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>
          {yr}
        </text>
      ))}
      <line x1={xEra} x2={xEra} y1={MT - 8} y2={MT + plotH} strokeWidth="1.5" strokeDasharray="4 3" style={{ stroke: "var(--fg)", opacity: 0.7 }} />
      {showEra && (
        <>
          <text x={ml + 4} y={MT - 12} style={{ fill: "var(--muted)", fontSize: 11, fontWeight: 600 }}>
            {t("chart.era.modis")}
          </text>
          <text x={xEnd - 2} y={MT - 12} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 11, fontWeight: 600 }}>
            {t("chart.era.both")}
          </text>
          <rect x={xEra + 6} y={MT + 4} width={pillW} height="22" rx="11" style={{ fill: "var(--surface-2)", stroke: "var(--fg)", strokeWidth: 1 }} />
          <text x={xEra + 6 + pillW / 2} y={MT + 15} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--fg)", fontSize: 11, fontWeight: 600 }}>
            {pillText}
          </text>
          <text x={xEra + 10} y={MT + 42} style={{ fill: "var(--muted)", fontSize: 11, paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3 }}>
            {t("chart.era.jump")}
          </text>
        </>
      )}
      {periodIdx !== null && (
        <line x1={x(periodIdx)} x2={x(periodIdx)} y1={MT} y2={MT + plotH} strokeWidth="2" strokeDasharray="2 3" style={{ stroke: "var(--accent-text)" }} />
      )}
      {cursorIdx !== null && <line x1={x(cursorIdx)} x2={x(cursorIdx)} y1={MT} y2={MT + plotH} style={{ stroke: "var(--fg)", opacity: 0.8 }} />}
      {children(y, plotH)}
    </svg>
  );
}

function Swatch({ color, shape, dashed, band, hollow }) {
  return (
    <svg width="34" height="14" aria-hidden="true" className="shrink-0">
      {band ? (
        <rect x="2" y="2" width="30" height="10" rx="3" style={{ fill: color, opacity: 0.25, stroke: color }} />
      ) : (
        <>
          <line x1="2" x2="32" y1="7" y2="7" strokeWidth="2" strokeDasharray={dashed ? "5 4" : undefined} style={{ stroke: color }} />
          <Marker shape={shape} x={17} y={7} color={color} hollow={hollow} />
        </>
      )}
    </svg>
  );
}

function FocusToolbar({ focus, onFocus }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t("chart.focus.label")} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t("chart.focus.label")}</span>
      <button type="button" aria-pressed={focus === null} onClick={() => onFocus(null)} className={`chip !px-2.5 !py-1 !text-xs ${focus === null ? "chip-on" : ""}`}>
        {t("chart.focus.all")}
      </button>
      {Object.entries(SERIES).map(([name, { color }]) => (
        <button
          key={name}
          type="button"
          aria-pressed={focus === name}
          onClick={() => onFocus(focus === name ? null : name)}
          className={`chip !px-2.5 !py-1 !text-xs ${focus === name ? "!border-fg font-semibold" : ""}`}
        >
          <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: color }} />
          {t(`chart.legend.${name}`)}
        </button>
      ))}
    </div>
  );
}

export function ChartLegend() {
  const { t } = useI18n();
  return (
    <ul aria-label={t("chart.legend.title")} className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs text-muted">
      <li className="flex items-center gap-2">
        <Swatch color="var(--c-est)" band />
        <span>{t("chart.legend.range")}</span>
      </li>
      <li className="flex items-center gap-2">
        <Swatch color="var(--forecast)" shape="diamond" dashed hollow />
        <span>{t("chart.legend.forecast")}</span>
      </li>
      <li className="flex items-center gap-2">
        <svg width="34" height="14" aria-hidden="true" className="shrink-0">
          <line x1="17" x2="17" y1="0" y2="14" strokeWidth="2" strokeDasharray="2 3" style={{ stroke: "var(--accent-text)" }} />
        </svg>
        <span>{t("chart.legend.selected")}</span>
      </li>
    </ul>
  );
}

function SelectedReadout({ row, period }) {
  const { t, formatNumber } = useI18n();
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const label = `${t(`month.${period.month}`)} ${period.year}`;
  const items = row
    ? [
        ["raw", t("series.raw_detections"), num(row.raw_detections), row.is_forecast],
        ["modis", t("series.raw_modis"), num(row.raw_modis), row.is_forecast],
        ["viirs", t("series.raw_viirs"), num(row.raw_viirs), row.is_forecast],
        ["estimated", t("series.estimated"), `${num(row.estimated)} (${num(row.est_low)}–${num(row.est_high)})`, false],
      ]
    : [];
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2" role="status" aria-live="polite">
      <div>
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{t("chart.selected.title")}</p>
        <p className="m-0 font-head text-xl font-extrabold">{label}</p>
      </div>
      {row ? (
        items
          .filter(([, , , hide]) => !hide)
          .map(([name, k, v]) => (
            <div key={name}>
              <p className="m-0 flex items-center gap-1.5 text-xs text-muted">
                <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: SERIES[name].color }} />
                {k}
              </p>
              <p className="m-0 text-sm font-semibold tabular-nums">{v}</p>
            </div>
          ))
      ) : (
        <p className="m-0 text-sm text-muted">{t("chart.selected.none")}</p>
      )}
      {row?.is_forecast && <p className="m-0 text-sm font-semibold text-forecast">{t("details.forecastNote")}</p>}
    </div>
  );
}

export default function FalseRecordChart({ series, region, period, onSelectPeriod }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [focusPos, setFocusPos] = useState(null);
  const [focus, setFocus] = useState(null);

  const rows = useMemo(
    () => series.map((r) => ({ ...r, idx: monthIndex(r.year, r.month) })).sort((a, b) => a.idx - b.idx),
    [series],
  );

  if (!rows.length) return <p className="m-0 text-muted">{t("chart.empty")}</p>;

  const ml = width < 560 ? 42 : 54;
  const plotW = Math.max(width - ml - MR, 10);
  const x = (idx) => ml + ((idx + 0.5) / N) * plotW;
  const observed = rows.filter((r) => !r.is_forecast);
  const rawMax = niceMax(Math.max(0, ...observed.map((r) => r.raw_detections)));
  const cellsMax = niceMax(Math.max(0, ...rows.map((r) => r.est_high), ...observed.map((r) => Math.max(r.raw_modis, r.raw_viirs ?? 0))));
  const periodIdx = monthIndex(period.year, period.month);
  const dense = rows.length > 96;
  const selectedRow = rows.find((r) => r.idx === periodIdx) ?? null;
  const peak = observed.reduce((best, r) => (best === null || r.estimated > best.estimated ? r : best), null);

  const active = hover ?? (focusPos !== null ? rows[Math.min(focusPos, rows.length - 1)] : selectedRow ?? rows[0]);
  const showCursor = hover !== null;

  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = null;
    let bestD = Infinity;
    for (const r of rows) {
      const d = Math.abs(x(r.idx) - px);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    setHover(bestD <= 28 ? best : null);
  };

  const onKeyDown = (e) => {
    const base = focusPos ?? Math.max(0, rows.findIndex((r) => r.idx === periodIdx));
    if (e.key === "ArrowRight") setFocusPos(Math.min(rows.length - 1, base + 1));
    else if (e.key === "ArrowLeft") setFocusPos(Math.max(0, base - 1));
    else if (e.key === "Enter" || e.key === " ") onSelectPeriod({ year: active.year, month: active.month });
    else return;
    setHover(null);
    e.preventDefault();
  };

  const label = (r) => `${t(`month.${r.month}`)} ${r.year}`;
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const lines = active.is_forecast
    ? [
        [t("series.estimated"), num(active.estimated)],
        [t("series.range"), `${num(active.est_low)} – ${num(active.est_high)}`],
      ]
    : [
        [t("series.raw_detections"), num(active.raw_detections)],
        [t("series.raw_modis"), num(active.raw_modis)],
        [t("series.raw_viirs"), num(active.raw_viirs)],
        [t("series.estimated"), num(active.estimated)],
        [t("series.range"), `${num(active.est_low)} – ${num(active.est_high)}`],
      ];
  const tipLeft = Math.min(Math.max(x(active.idx) + 14, 0), Math.max(width - 280, 0));
  const dim = (name) => focus !== null && focus !== name;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <SelectedReadout row={selectedRow} period={period} />
        <FocusToolbar focus={focus} onFocus={setFocus} />
      </div>

      <div
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label={t("chart.aria", { region: t(`region.${region}`), count: rows.length, from: label(rows[0]), to: label(rows[rows.length - 1]) })}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setFocusPos(null)}
        onClick={() => hover && onSelectPeriod({ year: hover.year, month: hover.month })}
        onKeyDown={onKeyDown}
        className="relative grid cursor-crosshair gap-8 rounded-2xl"
      >
        {width > 0 && (
          <>
            <div>
              <h3 className="m-0 text-lg font-bold">{t("chart.panelRaw.title")}</h3>
              <p className="m-0 mb-1 text-sm text-muted">{t("chart.panelRaw.sub")}</p>
              <Frame width={width} ml={ml} yMax={rawMax} x={x} periodIdx={periodIdx} cursorIdx={showCursor ? active.idx : null} showEra>
                {(y) => <Series rows={observed} pick={(r) => r.raw_detections} x={x} y={y} name="raw" dense={dense} dim={dim("raw")} strong={focus === "raw"} area selectedIdx={periodIdx} />}
              </Frame>
            </div>
            <div>
              <h3 className="m-0 text-lg font-bold">{t("chart.panelCells.title")}</h3>
              <p className="m-0 mb-1 text-sm text-muted">{t("chart.panelCells.sub")}</p>
              <Frame width={width} ml={ml} yMax={cellsMax} x={x} periodIdx={periodIdx} cursorIdx={showCursor ? active.idx : null}>
                {(y) => (
                  <>
                    <Series rows={observed} pick={(r) => r.raw_modis} x={x} y={y} name="modis" dense={dense} dim={dim("modis")} strong={focus === "modis"} selectedIdx={periodIdx} />
                    <Series rows={observed} pick={(r) => r.raw_viirs} x={x} y={y} name="viirs" dense={dense} dim={dim("viirs")} strong={focus === "viirs"} selectedIdx={periodIdx} />
                    <Series rows={rows} pick={(r) => r.estimated} x={x} y={y} name="estimated" withBand area dense={dense} dim={dim("estimated")} strong={focus === "estimated"} selectedIdx={periodIdx} />
                    {peak && width > 520 && (
                      <g style={{ opacity: dim("estimated") ? 0.5 : 1 }}>
                        <circle cx={x(peak.idx)} cy={y(peak.estimated)} r="8" fill="none" strokeWidth="1.5" style={{ stroke: "var(--fg)" }} />
                        <text x={Math.min(x(peak.idx) + 12, width - 150)} y={y(peak.estimated) - 8} style={{ fill: "var(--fg)", fontSize: 11, fontWeight: 600, ...HALO }}>
                          {t("chart.peak", { label: label(peak) })}
                        </text>
                      </g>
                    )}
                  </>
                )}
              </Frame>
            </div>
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-none absolute top-24 z-20 w-[264px] rounded-xl border border-line-strong bg-surface p-3 text-sm shadow-xl ${hover ? "opacity-100" : "sr-only"}`}
              style={{ left: tipLeft }}
            >
              <p className="m-0 font-semibold">{label(active)}</p>
              <p className="m-0 mb-1 text-xs text-muted">
                {t(active.is_forecast ? "status.forecast" : "status.observed")} · {t(`source.${active.source}`)}
              </p>
              <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[13px] leading-snug tabular-nums">
                {lines.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="m-0 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        )}
      </div>
      <div className="grid gap-2">
        <ChartLegend />
        <p className="m-0 text-xs text-muted">
          {t("chart.hint")} {t("chart.note.gaps")}
        </p>
      </div>
    </div>
  );
}
