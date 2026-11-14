import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useElementWidth } from "../lib/hooks.js";
import { FIRST_YEAR, LAST_YEAR, VIIRS_START_YEAR } from "../config.js";
import { monthIndex } from "../lib/period.js";

const N = (LAST_YEAR - FIRST_YEAR + 1) * 12;
const PANEL_H = 176;
const MT = 22;
const MB = 24;
const MR = 14;

function niceMax(value) {
  if (!(value > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
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

function Marker({ shape, x, y, color, hollow }) {
  const style = { fill: hollow ? "var(--surface)" : color, stroke: color, strokeWidth: 1.6 };
  if (shape === "square") return <rect x={x - 3.5} y={y - 3.5} width="7" height="7" style={style} />;
  if (shape === "diamond") {
    return <polygon points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} style={style} />;
  }
  if (shape === "triangle") return <polygon points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} style={style} />;
  return <circle cx={x} cy={y} r="4" style={style} />;
}

function Series({ rows, pick, x, y, color, shape, withBand }) {
  const runs = buildRuns(rows, pick);
  return (
    <g>
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
            {run.rows.length > 1 && (
              <polyline
                points={pts.join(" ")}
                fill="none"
                strokeWidth="2"
                strokeDasharray={run.forecast ? "5 4" : undefined}
                style={{ stroke: color }}
              />
            )}
          </g>
        );
      })}
      {rows.map((r) => {
        if (pick(r) === null || pick(r) === undefined) return null;
        return (
          <g key={r.idx}>
            {withBand && (
              <line
                x1={x(r.idx)}
                x2={x(r.idx)}
                y1={y(r.est_low)}
                y2={y(r.est_high)}
                strokeWidth="1.5"
                style={{ stroke: color, opacity: 0.7 }}
              />
            )}
            <Marker shape={shape} x={x(r.idx)} y={y(pick(r))} color={color} hollow={r.is_forecast} />
          </g>
        );
      })}
    </g>
  );
}

function Frame({ width, ml, yMax, x, periodIdx, cursorIdx, showEra, children }) {
  const { t, locale } = useI18n();
  const compact = useMemo(() => new Intl.NumberFormat(locale, { notation: "compact" }), [locale]);
  const plotW = width - ml - MR;
  const plotH = PANEL_H - MT - MB;
  const y = (v) => MT + plotH - (v / yMax) * plotH;
  const step = width < 560 ? 4 : 2;
  const years = [];
  for (let yr = FIRST_YEAR; yr <= LAST_YEAR; yr += step) years.push(yr);
  const xEra = x(monthIndex(VIIRS_START_YEAR, 1) - 0.5);
  const xEnd = ml + plotW;
  const eraStyle = { fill: "var(--muted)", fontSize: 11, paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 };

  return (
    <svg width={width} height={PANEL_H} aria-hidden="true" className="block">
      <rect x={xEra} y={MT} width={xEnd - xEra} height={plotH} style={{ fill: "var(--era-fill)" }} />
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (yMax / 4) * i;
        return (
          <g key={i}>
            <line x1={ml} x2={xEnd} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} strokeWidth="1" />
            <text x={ml - 6} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 11 }}>
              {compact.format(v)}
            </text>
          </g>
        );
      })}
      {years.map((yr) => (
        <text
          key={yr}
          x={x(monthIndex(yr, 1))}
          y={PANEL_H - 6}
          textAnchor="middle"
          style={{ fill: "var(--muted)", fontSize: 11 }}
        >
          {yr}
        </text>
      ))}
      <line
        x1={xEra}
        x2={xEra}
        y1={MT - 6}
        y2={MT + plotH}
        strokeWidth="1.5"
        strokeDasharray="4 3"
        style={{ stroke: "var(--muted)" }}
      />
      {showEra && (
        <>
          <text x={(ml + xEra) / 2} y={MT - 8} textAnchor="middle" style={eraStyle}>
            {t("chart.era.modis")}
          </text>
          <text x={(xEra + xEnd) / 2} y={MT - 8} textAnchor="middle" style={eraStyle}>
            {t("chart.era.both")}
          </text>
        </>
      )}
      {showEra && (
        <text x={xEra + 6} y={MT + 12} style={eraStyle}>
          {t("chart.era.marker")}
        </text>
      )}
      {periodIdx !== null && (
        <line
          x1={x(periodIdx)}
          x2={x(periodIdx)}
          y1={MT}
          y2={MT + plotH}
          strokeWidth="2"
          strokeDasharray="2 3"
          style={{ stroke: "var(--accent)" }}
        />
      )}
      {cursorIdx !== null && (
        <line x1={x(cursorIdx)} x2={x(cursorIdx)} y1={MT} y2={MT + plotH} strokeWidth="1" style={{ stroke: "var(--fg)" }} />
      )}
      {children(y)}
    </svg>
  );
}

function PanelTitle({ title, sub }) {
  return (
    <div className="mb-1 mt-4 first:mt-0">
      <h3 className="m-0 text-base font-semibold">{title}</h3>
      <p className="m-0 text-sm text-muted">{sub}</p>
    </div>
  );
}

function Swatch({ color, shape, dashed, band, hollow }) {
  return (
    <svg width="34" height="14" aria-hidden="true" className="shrink-0">
      {band ? (
        <rect x="2" y="2" width="30" height="10" style={{ fill: color, opacity: 0.25, stroke: color }} />
      ) : (
        <>
          <line x1="2" x2="32" y1="7" y2="7" strokeWidth="2" strokeDasharray={dashed ? "5 4" : undefined} style={{ stroke: color }} />
          <Marker shape={shape} x={17} y={7} color={color} hollow={hollow} />
        </>
      )}
    </svg>
  );
}

export function ChartLegend() {
  const { t } = useI18n();
  const items = [
    ["raw", <Swatch key="s" color="var(--c-raw)" shape="triangle" />],
    ["modis", <Swatch key="s" color="var(--c-modis)" shape="circle" />],
    ["viirs", <Swatch key="s" color="var(--c-viirs)" shape="square" />],
    ["estimated", <Swatch key="s" color="var(--c-est)" shape="diamond" />],
    ["range", <Swatch key="s" color="var(--c-est)" band />],
    ["forecast", <Swatch key="s" color="var(--c-est)" shape="diamond" dashed hollow />],
  ];
  return (
    <ul aria-label={t("chart.legend.title")} className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
      {items.map(([key, swatch]) => (
        <li key={key} className="flex items-center gap-2">
          {swatch}
          <span>{t(`chart.legend.${key}`)}</span>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <svg width="34" height="14" aria-hidden="true" className="shrink-0">
          <line x1="17" x2="17" y1="0" y2="14" strokeWidth="2" strokeDasharray="2 3" style={{ stroke: "var(--accent)" }} />
        </svg>
        <span>{t("chart.legend.selected")}</span>
      </li>
    </ul>
  );
}

export default function FalseRecordChart({ series, region, period, onSelectPeriod }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [focusPos, setFocusPos] = useState(0);

  const rows = useMemo(
    () => series.map((r) => ({ ...r, idx: monthIndex(r.year, r.month) })).sort((a, b) => a.idx - b.idx),
    [series],
  );

  if (!rows.length) {
    return <p className="m-0 text-muted">{t("chart.empty")}</p>;
  }

  const ml = width < 560 ? 40 : 52;
  const plotW = Math.max(width - ml - MR, 10);
  const x = (idx) => ml + ((idx + 0.5) / N) * plotW;
  const observed = rows.filter((r) => !r.is_forecast);
  const rawMax = niceMax(Math.max(0, ...observed.map((r) => r.raw_detections)));
  const cellsMax = niceMax(Math.max(0, ...rows.map((r) => r.est_high), ...observed.map((r) => Math.max(r.raw_modis, r.raw_viirs ?? 0))));
  const periodIdx = monthIndex(period.year, period.month);

  const active = hover ?? rows[Math.min(focusPos, rows.length - 1)];
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
    if (e.key === "ArrowRight") setFocusPos((p) => Math.min(rows.length - 1, p + 1));
    else if (e.key === "ArrowLeft") setFocusPos((p) => Math.max(0, p - 1));
    else if (e.key === "Enter" || e.key === " ") onSelectPeriod({ year: active.year, month: active.month });
    else return;
    setHover(null);
    e.preventDefault();
  };

  const label = (r) => `${t(`month.${r.month}`)} ${r.year}`;
  const num = (v) => (v === null || v === undefined ? t("series.na") : formatNumber(v));
  const statusKey = active.is_forecast ? "status.forecast" : "status.observed";
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
  const tipLeft = Math.min(Math.max(x(active.idx) + 14, 0), Math.max(width - 232, 0));

  return (
    <div>
      <div
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label={t("chart.aria", {
          region: t(`region.${region}`),
          count: rows.length,
          from: label(rows[0]),
          to: label(rows[rows.length - 1]),
        })}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onClick={() => hover && onSelectPeriod({ year: hover.year, month: hover.month })}
        onKeyDown={onKeyDown}
        className="relative cursor-crosshair rounded-lg"
      >
        {width > 0 && (
          <>
            <PanelTitle title={t("chart.panelRaw.title")} sub={t("chart.panelRaw.sub")} />
            <Frame width={width} ml={ml} yMax={rawMax} x={x} periodIdx={periodIdx} cursorIdx={showCursor ? active.idx : null} showEra>
              {(y) => <Series rows={observed} pick={(r) => r.raw_detections} x={x} y={y} color="var(--c-raw)" shape="triangle" />}
            </Frame>
            <PanelTitle title={t("chart.panelCells.title")} sub={t("chart.panelCells.sub")} />
            <Frame width={width} ml={ml} yMax={cellsMax} x={x} periodIdx={periodIdx} cursorIdx={showCursor ? active.idx : null}>
              {(y) => (
                <>
                  <Series rows={observed} pick={(r) => r.raw_modis} x={x} y={y} color="var(--c-modis)" shape="circle" />
                  <Series rows={observed} pick={(r) => r.raw_viirs} x={x} y={y} color="var(--c-viirs)" shape="square" />
                  <Series rows={rows} pick={(r) => r.estimated} x={x} y={y} color="var(--c-est)" shape="diamond" withBand />
                </>
              )}
            </Frame>
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-none absolute top-8 z-10 w-[216px] rounded-lg border border-line bg-surface p-2.5 text-sm shadow-lg ${
                hover ? "opacity-100" : "sr-only"
              }`}
              style={{ left: tipLeft }}
            >
              <p className="m-0 font-semibold">{label(active)}</p>
              <p className="m-0 mb-1 text-xs text-muted">
                {t(statusKey)} · {t(`source.${active.source}`)}
              </p>
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
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
      <ChartLegend />
      <p className="mb-0 mt-3 text-sm text-muted">{t("chart.hint")}</p>
      <p className="m-0 text-sm text-muted">{t("chart.note.gaps")}</p>
    </div>
  );
}
