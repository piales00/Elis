import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { useElementWidth } from "../../../lib/hooks.js";

const H = 168;
const MT = 14;
const MB = 22;

function compact(formatNumber, v) {
  return formatNumber(v, { notation: "compact", maximumFractionDigits: 1 });
}

export function SeasonHistory({ series, unit, forecast, periods }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const months = forecast.season_months ?? [8, 9, 10];
  const hindcast = (forecast.backtest?.seasons ?? []).filter((r) => r.region === unit.region && (r.lead ?? 1) === 1);

  const seasons = useMemo(() => {
    const out = [];
    for (let y = forecast.history_years?.[0] ?? 2003; y <= forecast.target_year - 1; y++) {
      const rows = months.map((m) => series.find((r) => r.year === y && r.month === m && !r.is_forecast));
      if (rows.some((r) => !r)) continue;
      const provisional = (periods ?? []).some((p) => p.confidence === "provisional" && months.some((m) => `${y}-${String(m).padStart(2, "0")}` >= p.from && `${y}-${String(m).padStart(2, "0")}` <= p.to));
      out.push({ year: y, value: rows.reduce((s, r) => s + r.estimated, 0), provisional, hind: hindcast.find((h) => h.year === y) ?? null });
    }
    return out;
  }, [series, months, forecast, periods, hindcast]);

  if (!seasons.length) return null;
  const years = [...seasons.map((s) => s.year), forecast.target_year];
  const top = Math.max(unit.high ?? 0, unit.thresholds?.[2] ?? 0, ...seasons.map((s) => Math.max(s.value, s.hind?.high ?? 0))) * 1.08;
  const ml = 40;
  const plotW = Math.max(width - ml - 6, 10);
  const slot = plotW / years.length;
  const x = (y) => ml + (years.indexOf(y) + 0.5) * slot;
  const yv = (v) => MT + (H - MT - MB) * (1 - Math.min(v, top) / top);
  const bw = Math.max(Math.min(slot * 0.62, 18), 2);
  const target = forecast.target_year;
  const active = hover !== null ? seasons.find((s) => s.year === hover) ?? (hover === target ? { year: target, forecast: true } : null) : null;

  return (
    <figure className="m-0">
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={t("outlook.history.aria", { from: seasons[0].year, to: seasons[seasons.length - 1].year })} className="block">
            {(unit.thresholds ?? []).map((v, i) => (
              <g key={i}>
                <line x1={ml} x2={width - 6} y1={yv(v)} y2={yv(v)} strokeDasharray="2 4" style={{ stroke: "var(--line-strong)" }} />
                <text x={ml - 6} y={yv(v) + 3} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 9.5 }}>
                  {compact(formatNumber, v)}
                </text>
              </g>
            ))}
            <line x1={ml} x2={width - 6} y1={yv(0)} y2={yv(0)} style={{ stroke: "var(--line-strong)" }} />
            {seasons.map((s) => (
              <g key={s.year} onPointerEnter={() => setHover(s.year)}>
                <rect x={x(s.year) - slot / 2} y={MT} width={slot} height={H - MT - MB} fill="transparent" />
                <rect x={x(s.year) - bw / 2} y={yv(s.value)} width={bw} height={yv(0) - yv(s.value)} rx={2} style={{ fill: s.provisional ? "var(--amber)" : "var(--c-est)", opacity: hover === null || hover === s.year ? 1 : 0.55 }} />
                {s.hind && (
                  <g>
                    <line x1={x(s.year)} x2={x(s.year)} y1={yv(s.hind.low)} y2={yv(s.hind.high)} strokeWidth="1.5" style={{ stroke: "var(--forecast)" }} />
                    <circle cx={x(s.year)} cy={yv(s.hind.median)} r="3" style={{ fill: "var(--surface)", stroke: "var(--forecast)", strokeWidth: 1.6 }} />
                  </g>
                )}
              </g>
            ))}
            {unit.published && (
              <g onPointerEnter={() => setHover(target)}>
                <rect x={x(target) - slot / 2} y={MT} width={slot} height={H - MT - MB} fill="transparent" />
                <rect x={x(target) - bw / 2} y={yv(unit.high)} width={bw} height={yv(unit.low) - yv(unit.high)} rx={2} style={{ fill: "var(--forecast)", opacity: 0.35, stroke: "var(--forecast)", strokeDasharray: "3 2" }} />
                <line x1={x(target) - bw / 2 - 2} x2={x(target) + bw / 2 + 2} y1={yv(unit.median)} y2={yv(unit.median)} strokeWidth="2.5" style={{ stroke: "var(--forecast)" }} />
              </g>
            )}
            {years
              .filter((y, i) => i % 4 === 0 || y === target)
              .map((y) => (
                <text key={y} x={x(y)} y={H - 6} textAnchor="middle" style={{ fill: y === target ? "var(--forecast)" : "var(--muted)", fontSize: 10, fontWeight: y === target ? 700 : 500 }}>
                  {y}
                </text>
              ))}
          </svg>
        )}
        {active && (
          <div className="fc-float pointer-events-none absolute top-0 z-10 rounded-lg px-2.5 py-1.5 text-xs tabular-nums" style={{ left: Math.min(Math.max(x(active.year) - 80, 0), Math.max(width - 190, 0)) }}>
            <span className="font-semibold">{t("outlook.history.season", { year: active.year })}</span>
            {active.forecast ? (
              <span className="block text-forecast">
                {t("status.kind.forecast")} · {formatNumber(unit.median, { maximumFractionDigits: 0 })} ({formatNumber(unit.low, { maximumFractionDigits: 0 })}–{formatNumber(unit.high, { maximumFractionDigits: 0 })})
              </span>
            ) : (
              <>
                <span className="block">
                  {t("outlook.history.observed")} {formatNumber(active.value, { maximumFractionDigits: 0 })}
                  {active.provisional && ` · ${t("status.kind.provisional")}`}
                </span>
                {active.hind && (
                  <span className="block text-forecast">
                    {t("outlook.history.hindcast")} {formatNumber(active.hind.median, { maximumFractionDigits: 0 })} ({formatNumber(active.hind.low, { maximumFractionDigits: 0 })}–{formatNumber(active.hind.high, { maximumFractionDigits: 0 })})
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: "var(--c-est)" }} />
          {t("outlook.history.legendObs")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: "var(--amber)" }} />
          {t("status.kind.provisional")}
        </span>
        {hindcast.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full border-[1.6px] border-forecast" />
            {t("outlook.history.legendHind")}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-forecast bg-forecast-soft" />
          {t("outlook.history.legendForecast", { year: target })}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-4 border-t border-dashed border-line-strong" />
          {t("outlook.history.legendThresholds")}
        </span>
      </figcaption>
      {!hindcast.length && <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{t("outlook.history.noHindcast")}</p>}
    </figure>
  );
}

export function SkillByLead({ unit }) {
  const { t, formatNumber } = useI18n();
  const rows = unit.skill_by_lead ?? [];
  if (!rows.length) return null;
  const vals = rows.flatMap((r) => [r.rpss, r.mae_skill]);
  const max = Math.max(0.4, ...vals);
  const min = Math.min(-0.1, ...vals);
  const W = 74;
  const pos = (v) => ((v - min) / (max - min)) * W;
  const zero = pos(0);
  const metrics = [
    ["rpss", "var(--forecast)"],
    ["mae_skill", "var(--c-est)"],
  ];
  return (
    <figure className="m-0">
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {rows.map((r) => (
          <li key={r.lead} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 text-xs">
            <span className="text-muted">{t("outlook.skill.lead", { n: r.lead })}</span>
            <div className="grid gap-1">
              {metrics.map(([k, color]) => {
                const v = r[k];
                const left = Math.min(pos(v), zero);
                const w = Math.abs(pos(v) - zero);
                return (
                  <div key={k} className="relative h-3.5">
                    <span aria-hidden="true" className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${zero}%` }} />
                    {k === "rpss" && <span aria-hidden="true" className="absolute inset-y-0 border-l border-dashed border-muted" style={{ left: `${pos(0.05)}%` }} />}
                    <span aria-hidden="true" className="absolute top-0.5 h-2.5 rounded-sm" style={{ left: `${left}%`, width: `${Math.max(w, 0.8)}%`, background: color, opacity: v < 0 ? 0.5 : 1 }} />
                    <span className="absolute top-[-1px] text-[10.5px] font-semibold tabular-nums" style={{ left: `calc(${Math.max(pos(v), zero)}% + 4px)` }}>
                      {formatNumber(v, { maximumFractionDigits: 2, signDisplay: "exceptZero" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "var(--forecast)" }} />
          {t("outlook.skill.rpss")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "var(--c-est)" }} />
          {t("outlook.skill.mae")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 border-l border-dashed border-muted" />
          {t("outlook.skill.threshold")}
        </span>
      </figcaption>
      <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{t("outlook.skill.read")}</p>
    </figure>
  );
}

export function OutOfSample({ forecast, unit }) {
  const { t, formatNumber } = useI18n();
  const rows = (forecast.out_of_sample?.rows ?? []).filter((r) => r.region === unit.region);
  if (!rows.length) return null;
  const n0 = (v) => formatNumber(v, { maximumFractionDigits: 0 });
  const leads = [...new Set(rows.map((r) => r.lead))].sort((a, b) => a - b);
  const observed = rows[0].observed;
  const top = Math.max(...rows.map((r) => r.high), observed) * 1.05;
  const pos = (v) => (v / top) * 100;
  return (
    <div className="grid gap-3">
      <p className="m-0 text-sm leading-relaxed">
        {t("outlook.oos.observed", { year: forecast.out_of_sample.year, value: n0(observed), cls: rows[0].observed_class ? t(`anomaly.${rows[0].observed_class}`) : t("series.na") })}
      </p>
      <ul className="m-0 grid list-none gap-3 p-0">
        {leads.map((lead) => {
          const pair = ["model", "climatology"].map((k) => rows.find((r) => r.lead === lead && r.kind === k)).filter(Boolean);
          const origin = pair[0]?.origin;
          return (
            <li key={lead} className="grid gap-1">
              <p className="m-0 text-xs text-muted">{t("outlook.oos.lead", { origin, n: lead })}</p>
              {pair.map((r) => (
                <div key={r.kind} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                  <span className={r.published_method ? "font-semibold" : "text-muted"}>
                    {t(`outlook.method.${r.kind}.short`)}
                    {r.published_method && <span className="ml-1 text-forecast">●</span>}
                  </span>
                  <div className="relative h-4 rounded-sm bg-surface-2" role="img" aria-label={t("outlook.oos.aria", { kind: t(`outlook.method.${r.kind}.short`), median: n0(r.median), low: n0(r.low), high: n0(r.high), observed: n0(observed) })}>
                    <span className="absolute top-1 h-2 rounded-full" style={{ left: `${pos(r.low)}%`, width: `${pos(r.high) - pos(r.low)}%`, background: r.kind === "model" ? "var(--forecast)" : "var(--line-strong)", opacity: 0.55 }} />
                    <span className="absolute top-0.5 h-3 w-[3px] rounded" style={{ left: `${pos(r.median)}%`, background: r.kind === "model" ? "var(--forecast)" : "var(--muted)" }} />
                    <span className="absolute -top-0.5 bottom-[-2px] w-0 border-l-2 border-fg" style={{ left: `${pos(observed)}%` }} />
                  </div>
                  <span className="tabular-nums">
                    {n0(r.median)} <span className={r.observed_inside ? "text-muted" : "text-danger"}>{r.observed_inside ? t("outlook.oos.inside") : t("outlook.oos.outside")}</span>
                  </span>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 border-l-2 border-fg" />
          {t("outlook.oos.legendObs")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-forecast">●</span>
          {t("outlook.oos.legendPublished")}
        </span>
      </p>
    </div>
  );
}
