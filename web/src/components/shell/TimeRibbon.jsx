import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { useElementWidth } from "../../lib/hooks.js";
import { FIRST_YEAR, LAST_YEAR } from "../../config.js";
import { fromIndex, MAX_INDEX, monthIndex } from "../../lib/period.js";
import { periodStatus } from "../../lib/status.js";
import { isoDate } from "../../lib/gibs.js";
import StatusChip from "./StatusChip.jsx";
import Icon from "./icons.jsx";
import { DayPicker, MonthPicker } from "./TimePicker.jsx";

const N = MAX_INDEX + 1;
const H = 60;
const TOP = 14;
const MARKERS = [
  { year: 2012, month: 1, key: "ribbon.marker.viirs", raw: false },
  { year: 2018, month: 4, key: "ribbon.marker.noaa20", raw: true },
  { year: 2023, month: 3, key: "ribbon.marker.noaa21", raw: true },
];

function shiftDay({ year, month, day }, delta) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export default function TimeRibbon({
  series,
  periods,
  loading,
  period,
  onChange,
  metric,
  onMetricChange,
  playing,
  onTogglePlay,
  imageryDate,
  onImageryDateChange,
  onFakeRecord,
  compact = false,
}) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const dragging = useRef(false);
  const [picker, setPicker] = useState(false);
  const closePicker = useCallback(() => setPicker(false), []);
  const raw = metric === "raw";

  const bars = useMemo(() => {
    const out = [];
    for (const r of series) {
      const idx = monthIndex(r.year, r.month);
      const value = raw ? (r.is_forecast ? null : r.raw_detections) : r.estimated;
      if (value === null || value === undefined) continue;
      out.push({ idx, value, row: r, status: periodStatus(series, periods, r.year, r.month).kind });
    }
    return out;
  }, [series, periods, raw]);
  const max = useMemo(() => {
    const top = Math.max(0, ...bars.map((b) => b.value));
    if (!(top > 0)) return 1;
    const step = 10 ** Math.floor(Math.log10(top)) / 2;
    return Math.ceil(top / step) * step;
  }, [bars]);

  const idx = monthIndex(period.year, period.month);
  const status = periodStatus(series, periods, period.year, period.month);
  const label = (p) => `${t(`month.${p.month}`)} ${p.year}`;
  const x = (i) => (i / N) * width;
  const bw = Math.max(width / N - (width > 700 ? 0.7 : 0.35), 0.6);
  const yv = (v) => TOP + (H - TOP) * (1 - Math.min(v, max) / max);
  const tone = (b) => {
    if (b.idx === idx) return "var(--accent)";
    if (b.status === "forecast") return "var(--forecast)";
    if (b.status === "provisional" || b.status === "partial") return "var(--amber)";
    return raw ? "var(--c-raw)" : "var(--c-est)";
  };

  const pick = (clientX, target) => {
    const rect = target.getBoundingClientRect();
    const i = Math.floor(((clientX - rect.left) / rect.width) * N);
    return Math.min(MAX_INDEX, Math.max(0, i));
  };
  const onPointerDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(fromIndex(pick(e.clientX, e.currentTarget)));
  };
  const onPointerMove = (e) => {
    const i = pick(e.clientX, e.currentTarget);
    setHover(i);
    if (dragging.current && i !== idx) onChange(fromIndex(i));
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e) => {
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -12, PageUp: 12 };
    let next = null;
    if (e.key in map) next = idx + map[e.key];
    else if (e.key === "Home") next = monthIndex(FIRST_YEAR, 11);
    else if (e.key === "End") next = MAX_INDEX;
    if (next === null) return;
    e.preventDefault();
    onChange(fromIndex(Math.min(MAX_INDEX, Math.max(0, next))));
  };

  const valueText = () => {
    const row = status.row;
    const base = `${label(period)}, ${t(`status.kind.${status.kind}`)}`;
    if (!row) return base;
    return `${base}, ${formatNumber(row.estimated)} ${t("unit.short")} (${formatNumber(row.est_low)}–${formatNumber(row.est_high)})`;
  };

  const hoverBar = hover !== null ? bars.find((b) => b.idx === hover) : null;
  const hoverPeriod = hover !== null ? fromIndex(hover) : null;
  const tickEvery = width < 520 ? 6 : width < 900 ? 4 : 2;
  const years = [];
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) years.push(y);
  const imagery = Boolean(imageryDate);
  const lowEnd = periods?.find((p) => p.confidence === "low" && p.to)?.to;

  return (
    <div className="fc-ribbon flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-pressed={playing}
          aria-label={t(playing ? "ribbon.pause" : imagery ? "ribbon.playDays" : "ribbon.play")}
          title={t(playing ? "ribbon.pause" : imagery ? "ribbon.playDays" : "ribbon.play")}
          className="fc-press grid size-9 place-items-center rounded-full bg-fg text-bg hover:opacity-90"
        >
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        <div className="relative min-w-[7.5rem]">
          {imagery ? (
            <div className="flex items-center gap-1">
              <button type="button" className="fc-icon-btn" aria-label={t("imagery.day.prev")} onClick={() => onImageryDateChange(shiftDay(imageryDate, -1))}>
                <Icon name="prev" size={16} />
              </button>
              <button
                type="button"
                data-picker-trigger
                data-tour="calendar"
                aria-expanded={picker}
                aria-haspopup="dialog"
                aria-label={`${t("imagery.day.label")}: ${imageryDate.day} ${t(`month.${imageryDate.month}`)} ${imageryDate.year}`}
                onClick={() => setPicker((v) => !v)}
                className="fc-date-btn"
              >
                <Icon name="calendar" size={15} className="text-muted" />
                <span className="tabular-nums">
                  {imageryDate.day} {t(`month.${imageryDate.month}`)} {imageryDate.year}
                </span>
              </button>
              <button type="button" className="fc-icon-btn" aria-label={t("imagery.day.next")} onClick={() => onImageryDateChange(shiftDay(imageryDate, 1))}>
                <Icon name="next" size={16} />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                data-picker-trigger
                data-tour="calendar"
                aria-expanded={picker}
                aria-haspopup="dialog"
                aria-label={`${t("picker.open")}: ${label(period)}`}
                onClick={() => setPicker((v) => !v)}
                className="fc-date-btn !px-1.5 font-head text-lg font-extrabold leading-tight"
              >
                <span className="tabular-nums" aria-live="polite">
                  {label(period)}
                </span>
                <Icon name="chevron" size={14} className="text-muted" />
              </button>
              {!loading && <StatusChip status={status} className="ml-1.5" />}
            </>
          )}
          {picker &&
            (imagery ? (
              <DayPicker
                date={imageryDate}
                onClose={closePicker}
                onPick={(d) => {
                  onImageryDateChange(d);
                  setPicker(false);
                }}
              />
            ) : (
              <MonthPicker
                series={series}
                periods={periods}
                period={period}
                onClose={closePicker}
                onPick={(p) => {
                  onChange(p);
                  setPicker(false);
                }}
                onFakeRecord={() => {
                  onFakeRecord?.();
                  setPicker(false);
                }}
              />
            ))}
        </div>
      </div>

      <div className="relative order-last min-w-0 basis-full md:order-none md:basis-0 md:flex-1">
        <div
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={t("ribbon.label")}
          aria-valuemin={0}
          aria-valuemax={MAX_INDEX}
          aria-valuenow={idx}
          aria-valuetext={valueText()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          className="fc-strip relative cursor-ew-resize touch-none select-none rounded-md"
          style={{ height: compact ? 40 : H + 16 }}
        >
          {width > 0 && (
            <svg width={width} height={compact ? 40 : H + 16} aria-hidden="true" className="block">
              {lowEnd && (
                <rect x={x(monthIndex(FIRST_YEAR, 11))} y={TOP - 2} width={x(monthIndex(Number(lowEnd.slice(0, 4)), Number(lowEnd.slice(5, 7))) + 1) - x(monthIndex(FIRST_YEAR, 11))} height={H - TOP + 2} style={{ fill: "var(--surface-3)", opacity: 0.6 }} />
              )}
              <line x1={0} x2={width} y1={H} y2={H} style={{ stroke: "var(--line-strong)" }} />
              {loading
                ? null
                : bars.map((b) => (
                    <rect
                      key={b.idx}
                      x={x(b.idx)}
                      y={yv(b.value)}
                      width={bw}
                      height={Math.max(H - yv(b.value), 0.5)}
                      style={{ fill: tone(b), opacity: b.status === "forecast" ? 0.55 : b.status === "low" && b.idx !== idx ? 0.55 : 1 }}
                    />
                  ))}
              {MARKERS.filter((m) => !m.raw || raw).map((m) => {
                const mx = x(monthIndex(m.year, m.month));
                return (
                  <g key={m.key}>
                    <line x1={mx} x2={mx} y1={2} y2={H} strokeDasharray="2 2" style={{ stroke: "var(--muted)" }} />
                    {!compact && (
                      <text x={mx + 3} y={9} style={{ fill: "var(--muted)", fontSize: 10, fontWeight: 600 }}>
                        {t(m.key)}
                      </text>
                    )}
                  </g>
                );
              })}
              <line x1={x(idx) + bw / 2} x2={x(idx) + bw / 2} y1={TOP - 4} y2={H + 3} strokeWidth="1.5" style={{ stroke: "var(--accent)" }} />
              {!compact &&
                years.map((y) => {
                  const yx = x(monthIndex(y, 1));
                  const show = (y - FIRST_YEAR) % tickEvery === 0;
                  return (
                    <g key={y}>
                      <line x1={yx} x2={yx} y1={H} y2={H + 3} style={{ stroke: "var(--line-strong)" }} />
                      {show && (
                        <text x={yx + 2} y={H + 13} style={{ fill: y === period.year ? "var(--fg)" : "var(--muted)", fontSize: 10, fontWeight: y === period.year ? 700 : 500 }} className="tabular-nums">
                          {y}
                        </text>
                      )}
                    </g>
                  );
                })}
            </svg>
          )}
          {hoverPeriod && (
            <div
              className="fc-float pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs tabular-nums"
              style={{ left: Math.min(Math.max(x(hover) - 70, 0), Math.max(width - 190, 0)) }}
            >
              <span className="font-semibold">{label(hoverPeriod)}</span>
              {hoverBar ? (
                <span className="text-muted">
                  {" · "}
                  {formatNumber(hoverBar.value)} {raw ? t("ribbon.unit.raw") : t("unit.short")}
                  {!raw && ` (${formatNumber(hoverBar.row.est_low)}–${formatNumber(hoverBar.row.est_high)})`}
                  {hoverBar.status === "forecast" && ` · ${t("status.kind.forecast")}`}
                </span>
              ) : (
                <span className="text-muted"> · {t("status.kind.unavailable")}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3 md:ml-0">
        <div role="radiogroup" aria-label={t("ribbon.metric")} data-tour="metric" className="fc-seg">
          {["raw", "estimated"].map((m) => (
            <button key={m} type="button" role="radio" aria-checked={metric === m} onClick={() => onMetricChange(m)} className="fc-seg-item">
              <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: m === "raw" ? "var(--c-raw)" : "var(--c-est)" }} />
              {t(`ribbon.metric.${m}`)}
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <p className="m-0 hidden basis-full text-[11px] leading-4 text-muted xl:block">
          {t(raw ? "ribbon.caption.raw" : "ribbon.caption.estimated", { max: formatNumber(max) })}
        </p>
      )}
    </div>
  );
}
