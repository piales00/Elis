import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { fmtInt, fmtNum } from "../../data/chat.js";

const MONTH_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_SHORT_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function ChatChart({ chartData, onSyncView }) {
  const { locale, t } = useI18n();
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!chartData || !Array.isArray(chartData.series) || chartData.series.length === 0) {
    return null;
  }

  const { chart, title, unit = "fire cell-days", region, highlight_year, series } = chartData;
  const isMonthly = chart === "year_vs_history" || chart === "forecast";
  const showRawOverlay = chart === "raw_vs_corrected";
  const monthNames = locale === "es" ? MONTH_SHORT_ES : MONTH_SHORT_EN;

  const width = 440;
  const height = 176;
  const padLeft = 44;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    1,
    ...series.map((d) =>
      Math.max(
        Number(d.estimated || 0),
        Number(d.est_high || 0),
        Number(d.hist_median || 0),
        showRawOverlay ? Number(d.raw_detections || 0) : 0,
      ),
    ),
  );

  const xFor = (i) =>
    series.length === 1
      ? padLeft + plotW / 2
      : padLeft + (i / (series.length - 1)) * plotW;

  const yFor = (val) => padTop + plotH - (Math.max(0, Number(val || 0)) / maxVal) * plotH;

  const estPath = series
    .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.estimated).toFixed(1)}`)
    .join(" ");

  const rawPath = showRawOverlay
    ? series
        .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.raw_detections).toFixed(1)}`)
        .join(" ")
    : "";

  const medianPath = isMonthly
    ? series
        .filter((d) => d.hist_median !== null && d.hist_median !== undefined)
        .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.hist_median).toFixed(1)}`)
        .join(" ")
    : "";

  const hasBand = series.some((d) => d.est_low !== null && d.est_low !== undefined && d.est_high !== null && d.est_high !== undefined);
  const bandPolygon = hasBand
    ? [
        ...series.map((d, i) => `${xFor(i).toFixed(1)},${yFor(d.est_high ?? d.estimated).toFixed(1)}`),
        ...series
          .slice()
          .reverse()
          .map((d, revI) => {
            const idx = series.length - 1 - revI;
            return `${xFor(idx).toFixed(1)},${yFor(d.est_low ?? d.estimated).toFixed(1)}`;
          }),
      ].join(" ")
    : "";

  const activePoint = hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[series.length - 1];

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-bg p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-semibold text-fg">{title}</p>
          <p className="m-0 text-[11px] text-muted">
            {t("chat.chart.unitLabel")}: <span className="font-mono text-fg">{unit}</span>
          </p>
        </div>
        {onSyncView && (
          <button
            type="button"
            onClick={() =>
              onSyncView({
                region: region || "peru",
                year: highlight_year || activePoint?.year || 2024,
                month: activePoint?.month || 9,
              })
            }
            className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-fg transition hover:border-est cursor-pointer"
          >
            {t("chat.chart.syncView")}
          </button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label={title}
      >
        {[0, 0.5, 1].map((frac) => {
          const y = padTop + plotH * (1 - frac);
          const val = maxVal * frac;
          return (
            <g key={frac}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="var(--line)" strokeDasharray="3 3" />
              <text x={padLeft - 6} y={y + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)">
                {val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k` : Math.round(val)}
              </text>
            </g>
          );
        })}

        {hasBand && bandPolygon && (
          <polygon points={bandPolygon} fill="var(--era-fill)" stroke="none" />
        )}

        {medianPath && (
          <path
            d={medianPath}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {showRawOverlay && rawPath && (
          <path d={rawPath} fill="none" stroke="var(--c-raw)" strokeWidth="2" />
        )}

        <path d={estPath} fill="none" stroke="var(--c-est)" strokeWidth="2.2" />

        {series.map((d, i) => {
          const cx = xFor(i);
          const cy = yFor(d.estimated);
          const isHighlighted =
            hoverIdx === i ||
            (!isMonthly && highlight_year && d.year === highlight_year) ||
            Boolean(d.is_forecast);
          const dotColor = d.is_forecast
            ? "var(--forecast)"
            : d.provisional
              ? "var(--c-modis)"
              : "var(--c-est)";

          const showTick =
            isMonthly ||
            series.length <= 10 ||
            i === 0 ||
            i === series.length - 1 ||
            d.year === highlight_year ||
            d.year % 5 === 0;

          const tickLabel = isMonthly
            ? monthNames[(Number(d.month || 1) - 1) % 12]
            : String(d.year);

          return (
            <g
              key={isMonthly ? `${d.year}-${d.month}` : d.year}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={cx - plotW / Math.max(series.length * 2, 4)}
                y={padTop}
                width={plotW / Math.max(series.length, 2)}
                height={plotH}
                fill="transparent"
              />
              <circle
                cx={cx}
                cy={cy}
                r={isHighlighted ? 4.2 : 2.6}
                fill={dotColor}
                stroke="var(--surface)"
                strokeWidth="1.4"
              />
              {showTick && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
                  {tickLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {activePoint && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1.5 text-[11px] text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-est" />
              <span>{t("chat.chart.harmonized")}</span>
            </span>
            {showRawOverlay && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--c-raw)]" />
                <span>{t("chat.chart.raw")}</span>
              </span>
            )}
            {isMonthly && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-muted" />
                <span>{t("chat.chart.median")}</span>
              </span>
            )}
            {series.some((d) => d.is_forecast) && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-forecast" />
                <span>{t("chat.chart.forecast")}</span>
              </span>
            )}
          </div>
          <div className="font-mono text-fg">
            {isMonthly
              ? `${activePoint.year}-${String(activePoint.month).padStart(2, "0")}`
              : activePoint.year}
            {": "}
            <span>{fmtNum(activePoint.estimated, 1)}</span>
            {activePoint.est_low != null && activePoint.est_high != null && (
              <span className="text-muted">
                {" "}
                [{fmtNum(activePoint.est_low, 1)}–{fmtNum(activePoint.est_high, 1)}]
              </span>
            )}
            {showRawOverlay && activePoint.raw_detections != null && (
              <span className="text-[var(--c-raw)]"> · raw: {fmtInt(activePoint.raw_detections)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
