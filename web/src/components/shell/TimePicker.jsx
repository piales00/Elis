import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { FIRST_YEAR, LAST_YEAR } from "../../config.js";
import { periodStatus } from "../../lib/status.js";
import { daysInMonth, fireLayers, isoDate } from "../../lib/gibs.js";
import Icon from "./icons.jsx";

const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
const CLASS_BG = {
  low: "var(--sat)",
  normal: "var(--line-strong)",
  high: "var(--amber)",
  very_high: "var(--accent)",
};

function usePopover(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => {
      if (!ref.current?.contains(e.target) && !e.target.closest?.("[data-picker-trigger]")) onClose();
    };
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return ref;
}

export function MonthPicker({ series, periods, period, onPick, onFakeRecord, onClose }) {
  const { t, formatNumber } = useI18n();
  const ref = usePopover(onClose);
  const [cursor, setCursor] = useState(period);
  const grid = useRef(null);

  const cells = useMemo(() => {
    const map = new Map();
    for (const y of YEARS) for (let m = 1; m <= 12; m++) map.set(`${y}-${m}`, periodStatus(series, periods, y, m));
    return map;
  }, [series, periods]);

  const observed = series.filter((r) => !r.is_forecast);
  const latest = observed.reduce((a, r) => (!a || r.year * 12 + r.month > a.year * 12 + a.month ? r : a), null);
  const peak = observed
    .filter((r) => periodStatus(series, periods, r.year, r.month).kind !== "low")
    .reduce((a, r) => (!a || r.estimated > a.estimated ? r : a), null);

  useEffect(() => {
    grid.current?.querySelector(`[data-ym="${cursor.year}-${cursor.month}"]`)?.focus();
  }, [cursor]);

  const move = (dy, dm) =>
    setCursor((c) => {
      let m = c.month + dm;
      let y = c.year + dy;
      if (m < 1) {
        m = 12;
        y -= 1;
      } else if (m > 12) {
        m = 1;
        y += 1;
      }
      return { year: Math.min(LAST_YEAR, Math.max(FIRST_YEAR, y)), month: m };
    });
  const onKeyDown = (e) => {
    const map = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    if (map[e.key]) {
      e.preventDefault();
      move(...map[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(cursor);
    }
  };

  const describe = (p) => {
    const st = cells.get(`${p.year}-${p.month}`);
    const label = `${t(`month.${p.month}`)} ${p.year}`;
    if (!st?.row) return `${label} · ${t("status.kind.unavailable")}`;
    const r = st.row;
    const n = (v) => formatNumber(v, { maximumFractionDigits: 0 });
    return `${label} · ${n(r.estimated)} (${n(r.est_low)}–${n(r.est_high)}) ${t("unit.short")} · ${r.anomaly_class ? t(`anomaly.${r.anomaly_class}`) : t("series.na")} · ${t(`status.kind.${st.kind}`)}`;
  };

  const chips = [
    latest && { key: "latest", run: () => onPick({ year: latest.year, month: latest.month }) },
    peak && { key: "peak", run: () => onPick({ year: peak.year, month: peak.month }) },
    { key: "fake", run: onFakeRecord },
    period.year > FIRST_YEAR && { key: "lastYear", run: () => onPick({ year: period.year - 1, month: period.month }) },
  ].filter(Boolean);

  return (
    <div ref={ref} role="dialog" aria-label={t("picker.title")} className="fc-float fc-pop fc-picker">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c.key} type="button" className="chip !py-1 !text-xs" onClick={c.run}>
            {t(`picker.chip.${c.key}`, peak ? { month: `${t(`month.${peak.month}`)} ${peak.year}` } : undefined)}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[2.25rem_repeat(12,minmax(0,1fr))] gap-[2px] text-[10px] text-muted" aria-hidden="true">
        <span />
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="text-center">
            {t(`month.${i + 1}`).slice(0, 1)}
          </span>
        ))}
      </div>
      <div ref={grid} role="grid" aria-label={t("picker.grid")} onKeyDown={onKeyDown} className="fc-picker-grid mt-1 grid gap-[2px]">
        {YEARS.map((y) => (
          <div key={y} role="row" className="grid grid-cols-[2.25rem_repeat(12,minmax(0,1fr))] items-center gap-[2px]">
            <span role="rowheader" className={`text-[10px] tabular-nums ${y === period.year ? "font-bold text-fg" : "text-muted"}`}>
              {y}
            </span>
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const st = cells.get(`${y}-${m}`);
              const selected = y === period.year && m === period.month;
              const focus = y === cursor.year && m === cursor.month;
              const kind = st?.kind ?? "unavailable";
              const cls = st?.row?.anomaly_class;
              return (
                <button
                  key={m}
                  type="button"
                  role="gridcell"
                  data-ym={`${y}-${m}`}
                  tabIndex={focus ? 0 : -1}
                  aria-selected={selected}
                  aria-label={describe({ year: y, month: m })}
                  onPointerEnter={() => setCursor({ year: y, month: m })}
                  onClick={() => onPick({ year: y, month: m })}
                  data-kind={kind}
                  className="fc-cal-cell"
                  style={{ "--cell": kind === "forecast" || kind === "unavailable" ? "transparent" : CLASS_BG[cls] ?? "var(--surface-3)" }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="m-0 mt-2 min-h-[2.5em] text-xs tabular-nums" aria-live="polite">
        {describe(cursor)}
      </p>
      <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[11px] text-muted">
        {Object.entries(CLASS_BG).map(([k, c]) => (
          <li key={k} className="flex items-center gap-1">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: c }} />
            {t(`anomaly.${k}`)}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="fc-cal-cell !size-2.5" data-kind="provisional" style={{ "--cell": "var(--surface-3)" }} />
          {t("status.kind.provisional")}
        </li>
        <li className="flex items-center gap-1">
          <span aria-hidden="true" className="fc-cal-cell !size-2.5" data-kind="forecast" />
          {t("status.kind.forecast")}
        </li>
      </ul>
      <p className="m-0 mt-1 text-[11px] text-muted">{t("picker.note")}</p>
    </div>
  );
}

export function DayPicker({ date, onPick, onClose }) {
  const { t, locale } = useI18n();
  const ref = usePopover(onClose);
  const [view, setView] = useState({ year: date.year, month: date.month });
  const first = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();
  const offset = (first + 6) % 7;
  const n = daysInMonth(view.year, view.month);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  const shift = (d) =>
    setView((v) => {
      const m = v.month + d;
      const y = v.year + (m < 1 ? -1 : m > 12 ? 1 : 0);
      return { year: y, month: ((m + 11) % 12) + 1 };
    });
  const canPrev = view.year * 12 + view.month > 2000 * 12 + 11;
  const canNext = view.year * 12 + view.month < LAST_YEAR * 12 + 11;

  return (
    <div ref={ref} role="dialog" aria-label={t("picker.dayTitle")} className="fc-float fc-pop fc-picker !w-[18.5rem]">
      <div className="flex items-center justify-between">
        <button type="button" className="fc-icon-btn" disabled={!canPrev} onClick={() => shift(-1)} aria-label={t("picker.prevMonth")}>
          <Icon name="prev" size={16} />
        </button>
        <p className="m-0 text-sm font-semibold">
          {t(`month.${view.month}`)} {view.year}
        </p>
        <button type="button" className="fc-icon-btn" disabled={!canNext} onClick={() => shift(1)} aria-label={t("picker.nextMonth")}>
          <Icon name="next" size={16} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-muted" aria-hidden="true">
        {weekdays.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const day = i + 1;
          const d = { year: view.year, month: view.month, day };
          const layers = fireLayers(isoDate(d));
          const mark = layers.viirs ? "both" : layers.modis ? "modis" : "none";
          const on = date.year === d.year && date.month === d.month && date.day === day;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              aria-label={`${day} ${t(`month.${view.month}`)} ${view.year} · ${t(`picker.day.${mark}`)}`}
              onClick={() => onPick(d)}
              className={`fc-day ${on ? "fc-day-on" : ""}`}
              data-mark={mark}
            >
              {day}
            </button>
          );
        })}
      </div>
      <ul className="m-0 mt-2 grid list-none gap-0.5 p-0 text-[11px] text-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="fc-day-dot" data-mark="both" />
          {t("picker.day.both")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="fc-day-dot" data-mark="modis" />
          {t("picker.day.modis")}
        </li>
      </ul>
    </div>
  );
}
