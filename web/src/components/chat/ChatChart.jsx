import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { fmtInt, fmtNum } from "../../data/chat.js";

const MONTH_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_SHORT_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const MULTI_REGION_PALETTE = [
  { stroke: "var(--c-est)", bg: "var(--c-est)" },
  { stroke: "var(--c-modis)", bg: "var(--c-modis)" },
  { stroke: "var(--c-viirs)", bg: "var(--c-viirs)" },
  { stroke: "var(--c-raw)", bg: "var(--c-raw)" },
];

export default function ChatChart({ chartData, onSyncView }) {
  const { locale, t } = useI18n();
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!chartData) return null;

  const hasSeries = Array.isArray(chartData.series) && chartData.series.length > 0;
  const hasSeriesByRegion =
    chartData.series_by_region &&
    typeof chartData.series_by_region === "object" &&
    Object.keys(chartData.series_by_region).length > 0;

  if (!hasSeries && !hasSeriesByRegion) {
    return null;
  }

  const { chart, title, unit = "fire cell-days", region, highlight_year, series = [] } = chartData;
  const isMonthly = chart === "year_vs_history" || chart === "forecast" || chartData.granularity === "month";
  const showRawOverlay = chart === "raw_vs_corrected";
  const monthNames = locale === "es" ? MONTH_SHORT_ES : MONTH_SHORT_EN;

  const isMultiRegion = chart === "multi_region" && hasSeriesByRegion;
  const regionsList = isMultiRegion
    ? (Array.isArray(chartData.regions) && chartData.regions.length > 0
        ? chartData.regions
        : Object.keys(chartData.series_by_region))
    : [];
  const regionLabels = isMultiRegion ? (chartData.region_labels || {}) : {};

  const timePoints = isMultiRegion
    ? (chartData.series_by_region[regionsList[0]] || series)
    : series;

  const numPoints = timePoints.length;
  if (numPoints === 0) return null;

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
    ...(isMultiRegion
      ? regionsList.flatMap((r) =>
          (chartData.series_by_region[r] || []).map((d) => Math.max(Number(d.estimated || 0), Number(d.est_high || 0))),
        )
      : series.map((d) =>
          Math.max(
            Number(d.estimated || 0),
            Number(d.est_high || 0),
            Number(d.hist_median || 0),
            showRawOverlay ? Number(d.raw_detections || 0) : 0,
          ),
        )),
  );

  const xFor = (i) =>
    numPoints <= 1
      ? padLeft + plotW / 2
      : padLeft + (i / (numPoints - 1)) * plotW;

  const yFor = (val) => padTop + plotH - (Math.max(0, Number(val || 0)) / maxVal) * plotH;

  const multiRegionPaths = isMultiRegion
    ? regionsList.map((r, rIdx) => {
        const rSeries = chartData.series_by_region[r] || [];
        const pathD = rSeries
          .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.estimated).toFixed(1)}`)
          .join(" ");
        const color = MULTI_REGION_PALETTE[rIdx % MULTI_REGION_PALETTE.length];
        return {
          region: r,
          label: regionLabels[r] || r,
          series: rSeries,
          pathD,
          color,
        };
      })
    : [];

  const estPath = !isMultiRegion
    ? series
        .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.estimated).toFixed(1)}`)
        .join(" ")
    : "";

  const rawPath = !isMultiRegion && showRawOverlay
    ? series
        .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.raw_detections).toFixed(1)}`)
        .join(" ")
    : "";

  const medianPath = !isMultiRegion && isMonthly
    ? series
        .filter((d) => d.hist_median !== null && d.hist_median !== undefined)
        .map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(d.hist_median).toFixed(1)}`)
        .join(" ")
    : "";

  const hasBand = !isMultiRegion && series.some((d) => d.est_low !== null && d.est_low !== undefined && d.est_high !== null && d.est_high !== undefined);
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

  const activeIdx = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < numPoints ? hoverIdx : numPoints - 1;
  const activePoint = timePoints[activeIdx] || timePoints[0];
  const primaryRegion = isMultiRegion ? (regionsList[0] || region || "peru") : (region || "peru");

  return (
    <div className="mt-2.5 rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-semibold text-fg truncate">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted">
              {t("chat.chart.unitLabel")}: <span className="font-mono text-fg">{unit}</span>
            </span>
            {isMultiRegion && (
              <div className="flex flex-wrap items-center gap-1.5 pl-1.5 border-l border-line">
                {multiRegionPaths.map((rp) => (
                  <span
                    key={rp.region}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      border: `1px solid ${rp.color.stroke}`,
                      color: rp.color.stroke,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: rp.color.stroke }} />
                    <span>{rp.label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {onSyncView && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onSyncView({
                  region: primaryRegion,
                  regions: isMultiRegion ? regionsList : undefined,
                  year: highlight_year || activePoint?.year || 2024,
                  month: activePoint?.month || 9,
                  mode3d: false,
                })
              }
              className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-fg transition hover:border-est cursor-pointer"
            >
              {t("chat.chart.syncView")}
            </button>
            <button
              type="button"
              onClick={() =>
                onSyncView({
                  region: primaryRegion,
                  regions: isMultiRegion ? regionsList : undefined,
                  year: highlight_year || activePoint?.year || 2024,
                  month: activePoint?.month || 9,
                  mode3d: true,
                })
              }
              className="rounded-lg border border-forecast/50 bg-forecast/10 px-2 py-1 text-[11px] font-bold text-forecast transition hover:border-forecast cursor-pointer"
              title="Fly to 3D satellite relief and sync timeline"
            >
              3D Relief ↗
            </button>
          </div>
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

        {/* Single region fills and curves */}
        {!isMultiRegion && hasBand && bandPolygon && (
          <polygon points={bandPolygon} fill="var(--era-fill)" stroke="none" />
        )}

        {!isMultiRegion && medianPath && (
          <path
            d={medianPath}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {!isMultiRegion && showRawOverlay && rawPath && (
          <path d={rawPath} fill="none" stroke="var(--c-raw)" strokeWidth="2" />
        )}

        {!isMultiRegion && estPath && (
          <path d={estPath} fill="none" stroke="var(--c-est)" strokeWidth="2.2" />
        )}

        {/* Multi region curves */}
        {isMultiRegion &&
          multiRegionPaths.map((rp) => (
            <path
              key={rp.region}
              d={rp.pathD}
              fill="none"
              stroke={rp.color.stroke}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

        {/* Vertical hover guide */}
        {hoverIdx !== null && (
          <line
            x1={xFor(activeIdx)}
            y1={padTop}
            x2={xFor(activeIdx)}
            y2={padTop + plotH}
            stroke="var(--line-strong)"
            strokeDasharray="2 2"
            strokeWidth="1.2"
          />
        )}

        {/* Dots on curves */}
        {isMultiRegion
          ? multiRegionPaths.map((rp) => {
              const pt = rp.series[activeIdx];
              if (!pt) return null;
              const cx = xFor(activeIdx);
              const cy = yFor(pt.estimated);
              return (
                <circle
                  key={`dot-${rp.region}`}
                  cx={cx}
                  cy={cy}
                  r={hoverIdx !== null ? 4.5 : 3.2}
                  fill={rp.color.stroke}
                  stroke="var(--surface)"
                  strokeWidth="1.5"
                />
              );
            })
          : series.map((d, i) => {
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

              return (
                <circle
                  key={`dot-${d.year}-${d.month || 0}`}
                  cx={cx}
                  cy={cy}
                  r={isHighlighted ? 4.2 : 2.6}
                  fill={dotColor}
                  stroke="var(--surface)"
                  strokeWidth="1.4"
                />
              );
            })}

        {/* X axis ticks & hover zones */}
        {timePoints.map((d, i) => {
          const cx = xFor(i);
          const showTick =
            isMonthly ||
            numPoints <= 10 ||
            i === 0 ||
            i === numPoints - 1 ||
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
                x={cx - plotW / Math.max(numPoints * 2, 4)}
                y={padTop}
                width={plotW / Math.max(numPoints, 2)}
                height={plotH}
                fill="transparent"
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

      {/* Footer details strip */}
      {isMultiRegion ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted">
          <div className="font-mono text-fg font-semibold">
            {isMonthly
              ? `${activePoint?.year || 2024}-${String(activePoint?.month || 9).padStart(2, "0")}`
              : activePoint?.year || 2024}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {multiRegionPaths.map((rp) => {
              const pt = rp.series[activeIdx] || rp.series[rp.series.length - 1];
              return (
                <span key={rp.region} className="inline-flex items-center gap-1.5 font-mono text-fg">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: rp.color.stroke }} />
                  <span className="text-muted">{rp.label}:</span>
                  <span className="font-semibold">{fmtNum(pt?.estimated, 1)}</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : activePoint ? (
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
      ) : null}
    </div>
  );
}
