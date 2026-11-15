import { useMemo, useState } from "react";
import { useElementWidth } from "../../lib/hooks.js";

const ML = 44;
const MR = 12;
const MT = 12;
const MB = 24;

function niceMax(value) {
  if (!(value > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((n) => value / exp <= n);
  return nice * exp;
}

function path(points) {
  let d = "";
  let open = false;
  for (const p of points) {
    if (!p) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    open = true;
  }
  return d;
}

function band(xs, lows, highs) {
  const runs = [];
  let run = [];
  xs.forEach((x, i) => {
    if (lows[i] === null || highs[i] === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) runs.push(run);
  return runs
    .map((r) => {
      const top = r.map((i) => `${xs[i].toFixed(1)},${highs[i].toFixed(1)}`);
      const bottom = r
        .slice()
        .reverse()
        .map((i) => `${xs[i].toFixed(1)},${lows[i].toFixed(1)}`);
      return `M${top.join("L")}L${bottom.join("L")}Z`;
    })
    .join("");
}

export function Legend({ series }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
      {series.map((s) => (
        <li key={s.id} className="inline-flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            {s.low && <rect x="0" y="1" width="22" height="8" rx="2" fill={s.color} opacity="0.18" />}
            <line x1="1" x2="21" y1="5" y2="5" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinecap="round" opacity={s.muted ? 0.55 : 1} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export default function LineChart({ data, series, marker, cursor, onSelect, height = 200, format, xLabel, ariaLabel, describe }) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const n = data.length;
  const w = Math.max(width, 240);
  const innerW = w - ML - MR;
  const innerH = height - MT - MB;
  const x = (i) => ML + (n <= 1 ? 0 : (i / (n - 1)) * innerW);

  const yMax = useMemo(() => {
    let m = 0;
    for (const d of data)
      for (const s of series) {
        const v = s.high ? s.high(d) : s.value(d);
        if (v !== null && v !== undefined && v > m) m = v;
      }
    return niceMax(m);
  }, [data, series]);
  const y = (v) => MT + innerH - (v / yMax) * innerH;
  const ticks = [0, 0.5, 1].map((f) => f * yMax);
  const years = data.map((d, i) => [d.month, i]).filter(([m]) => m.endsWith("-01") && Number(m.slice(0, 4)) % 2 === 0);
  const markerIdx = marker ? data.findIndex((d) => d.month === marker.month) : -1;
  const cursorIdx = cursor ? data.findIndex((d) => d.month === cursor) : -1;
  const xs = data.map((_, i) => x(i));

  const move = (clientX, rect) => {
    const px = clientX - rect.left;
    const i = Math.round(((px - ML) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.shiftKey ? 12 : 1;
      setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + (e.key === "ArrowRight" ? step : -step))));
    } else if (e.key === "Escape") setHover(null);
    else if ((e.key === "Enter" || e.key === " ") && onSelect && hover !== null) {
      e.preventDefault();
      onSelect(data[hover]);
    }
  };
  const hd = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) + 10, 0), w - 210) : 0;
  const flip = hover !== null && x(hover) > w - 220;

  return (
    <div ref={ref} className="relative">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className={`fc-chart block max-w-full touch-pan-y ${onSelect ? "cursor-pointer" : ""}`}
        onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onClick={() => onSelect && hover !== null && onSelect(data[hover])}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={ML} x2={w - MR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={ML - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
              {format(v, true)}
            </text>
          </g>
        ))}
        {years.map(([m, i]) => (
          <text key={m} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
            {m.slice(0, 4)}
          </text>
        ))}
        {series
          .filter((s) => s.low)
          .map((s) => (
            <path
              key={`${s.id}-band`}
              d={band(
                xs,
                data.map((d) => (s.low(d) === null || s.low(d) === undefined ? null : y(s.low(d)))),
                data.map((d) => (s.high(d) === null || s.high(d) === undefined ? null : y(s.high(d)))),
              )}
              fill={s.color}
              opacity="0.16"
            />
          ))}
        {markerIdx >= 0 && (
          <g>
            <line x1={x(markerIdx)} x2={x(markerIdx)} y1={MT - 4} y2={MT + innerH} stroke="var(--fg)" strokeWidth="1.2" strokeDasharray="3 3" />
            <text x={x(markerIdx) + (x(markerIdx) > w - 120 ? -6 : 6)} y={MT + 8} textAnchor={x(markerIdx) > w - 120 ? "end" : "start"} fontSize="10.5" fontWeight="700" fill="var(--fg)" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3 }}>
              {marker.label}
            </text>
          </g>
        )}
        {cursorIdx >= 0 && <line x1={x(cursorIdx)} x2={x(cursorIdx)} y1={MT} y2={MT + innerH} stroke="var(--accent)" strokeWidth="1.5" />}
        {series.map((s) => (
          <path
            key={s.id}
            d={path(data.map((d, i) => (s.value(d) === null || s.value(d) === undefined ? null : [x(i), y(s.value(d))])))}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 1.8}
            strokeDasharray={s.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={s.muted ? 0.55 : 1}
          />
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={MT} y2={MT + innerH} stroke="var(--muted)" strokeWidth="1" />
            {series.map((s) => {
              const v = s.value(hd);
              if (v === null || v === undefined) return null;
              return <circle key={s.id} cx={x(hover)} cy={y(v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />;
            })}
          </g>
        )}
      </svg>
      {xLabel && <p className="sr-only">{xLabel}</p>}
      {hd && (
        <div className="fc-float pointer-events-none absolute top-1 z-10 w-[200px] rounded-lg px-2.5 py-2 text-xs" style={{ left: flip ? x(hover) - 210 : tipLeft }} role="status">
          {describe(hd)}
        </div>
      )}
    </div>
  );
}
