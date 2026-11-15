import { useMemo } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { useElementWidth } from "../../../lib/hooks.js";
import { chanceHigh, CLASSES, findUnit, seasonLabel, skillSummary } from "../../../lib/forecast.js";
import { OUTLOOK_MAP_COLORS } from "../useOutlookLayer.js";
import { OUTLOOK_STEPS } from "../../../lib/forecast.js";
import { OutOfSample, SeasonHistory, SkillByLead } from "./OutlookEvidence.jsx";

const CLASS_FILL = ["var(--p-2)", "var(--p-3)", "var(--p-4)", "var(--p-5)"];

function MethodBadge({ unit }) {
  const { t } = useI18n();
  const model = unit.method === "model";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${model ? "border-forecast bg-forecast-soft" : "border-dashed border-forecast"}`}>
      <p className="m-0 text-sm font-bold text-forecast">{t(model ? "outlook.method.model" : "outlook.method.climatology")}</p>
      <p className="m-0 mt-0.5 text-xs leading-relaxed text-muted">{unit.reason}</p>
    </div>
  );
}

function RangeStrip({ unit }) {
  const { t, formatNumber } = useI18n();
  const [ref, width] = useElementWidth();
  const [t0, t1, t2] = unit.thresholds;
  const max = Math.max(unit.high, t2) * 1.12;
  const x = (v) => 6 + (Math.min(v, max) / max) * (width - 12);
  const bands = [
    [0, t0],
    [t0, t1],
    [t1, t2],
    [t2, max],
  ];
  const compact = (v) => formatNumber(v, { notation: "compact", maximumFractionDigits: 1 });
  return (
    <figure className="m-0">
      <div ref={ref}>
        {width > 0 && (
          <svg width={width} height={74} role="img" aria-label={t("outlook.strip.aria", { median: formatNumber(unit.median, { maximumFractionDigits: 0 }), low: formatNumber(unit.low, { maximumFractionDigits: 0 }), high: formatNumber(unit.high, { maximumFractionDigits: 0 }) })} className="block">
            {bands.map(([a, b], i) => (
              <g key={i}>
                <rect x={x(a)} y={22} width={Math.max(x(b) - x(a) - 2, 0)} height={22} rx={3} style={{ fill: "var(--surface-3)", opacity: 0.45 + i * 0.18 }} />
                <text x={x(a) + 4} y={16} style={{ fill: "var(--muted)", fontSize: 10, fontWeight: 600 }}>
                  {t(`anomaly.${CLASSES[i]}`)}
                </text>
              </g>
            ))}
            <rect x={x(unit.low)} y={28} width={Math.max(x(unit.high) - x(unit.low), 2)} height={10} rx={5} style={{ fill: "var(--forecast)", opacity: 0.45 }} />
            <line x1={x(unit.median)} x2={x(unit.median)} y1={24} y2={42} strokeWidth="3" strokeLinecap="round" style={{ stroke: "var(--forecast)" }} />
            <line x1={x(unit.hist_median)} x2={x(unit.hist_median)} y1={20} y2={46} strokeWidth="1.5" strokeDasharray="2 2" style={{ stroke: "var(--fg)" }} />
            <text x={Math.min(x(unit.low), width - 120)} y={60} style={{ fill: "var(--muted)", fontSize: 10.5 }} className="tabular-nums">
              {compact(unit.low)}
            </text>
            <text x={Math.min(x(unit.high), width - 4)} y={60} textAnchor="end" style={{ fill: "var(--muted)", fontSize: 10.5 }} className="tabular-nums">
              {compact(unit.high)}
            </text>
          </svg>
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-4 rounded-full" style={{ background: "var(--forecast)", opacity: 0.55 }} />
          {t("outlook.strip.range")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-[3px] rounded" style={{ background: "var(--forecast)" }} />
          {t("outlook.strip.median")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 border-l border-dashed border-fg" />
          {t("outlook.strip.hist", { value: formatNumber(unit.hist_median, { maximumFractionDigits: 0 }) })}
        </span>
      </figcaption>
    </figure>
  );
}

function ProbabilityBar({ probabilities, climatology }) {
  const { t, formatNumber } = useI18n();
  const pct = (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });
  return (
    <div className="grid gap-2">
      <div className="flex h-7 gap-[2px] overflow-hidden rounded-md" role="img" aria-label={CLASSES.map((c) => `${t(`anomaly.${c}`)} ${pct(probabilities[c])}`).join(", ")}>
        {CLASSES.map((c, i) => (
          <div key={c} style={{ width: `${probabilities[c] * 100}%`, background: CLASS_FILL[i] }} className="min-w-[2px]" />
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-4 gap-1 p-0 text-xs">
        {CLASSES.map((c, i) => (
          <li key={c}>
            <span className="flex items-center gap-1.5 text-muted">
              <span aria-hidden="true" className="inline-block size-2 rounded-sm" style={{ background: CLASS_FILL[i] }} />
              {t(`anomaly.${c}`)}
            </span>
            <span className="font-semibold tabular-nums">{pct(probabilities[c])}</span>
          </li>
        ))}
      </ul>
      {climatology && (
        <p className="m-0 text-[11px] text-muted tabular-nums">
          {t("outlook.climatologyRef", { values: CLASSES.map((c) => pct(climatology[c])).join(" / ") })}
        </p>
      )}
    </div>
  );
}

function OutlookLegend() {
  const { t, formatNumber } = useI18n();
  const pct = (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });
  const labels = [`< ${pct(OUTLOOK_STEPS[0])}`, ...OUTLOOK_STEPS.slice(0, -1).map((s, i) => `${pct(s)}–${pct(OUTLOOK_STEPS[i + 1])}`), `≥ ${pct(OUTLOOK_STEPS[3])}`];
  return (
    <div className="fc-legend">
      <p className="m-0 mb-1.5 text-[12px] font-semibold">{t("outlook.legend.title")}</p>
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
        {OUTLOOK_MAP_COLORS.map((c, i) => (
          <li key={c} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: c }} />
            <span className="tabular-nums">{labels[i]}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="fc-hatch-swatch inline-block h-2.5 w-3.5 rounded-sm" />
          {t("outlook.legend.none")}
        </li>
      </ul>
      <p className="m-0 mt-1.5 text-muted">{t("outlook.legend.note")}</p>
    </div>
  );
}

export { OutlookLegend };

export default function OutlookView({ forecast, unitId, onSelectUnit, nextRows, series, periods, monthlyMethods }) {
  const { t, formatNumber } = useI18n();
  const data = forecast.data;
  const unit = findUnit(data, unitId);
  const pct = (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });
  const monthName = (m) => t(`month.${m}`);

  const ranking = useMemo(() => {
    const depts = (data?.regions ?? []).filter((r) => r.level === "department");
    const published = depts.filter((r) => r.published).sort((a, b) => chanceHigh(b) - chanceHigh(a));
    return [...published, ...depts.filter((r) => !r.published).sort((a, b) => a.name.localeCompare(b.name))];
  }, [data]);

  if (forecast.status === "loading") {
    return (
      <div className="grid gap-3" aria-busy="true">
        <div className="fc-skel h-10 w-2/3" />
        <div className="fc-skel h-16" />
        <div className="fc-skel h-24" />
      </div>
    );
  }
  if (forecast.status === "unavailable") {
    return (
      <div className="fc-empty">
        <p className="m-0 font-semibold">{t("outlook.mock.title")}</p>
        <p className="m-0 mt-1 text-sm text-muted">{t("outlook.mock.text")}</p>
      </div>
    );
  }
  if (forecast.status === "error") {
    return (
      <div role="alert" className="fc-empty">
        <p className="m-0 font-semibold text-danger">{t("status.error", { message: forecast.error?.message ?? "" })}</p>
        <button type="button" className="fc-btn mt-3" onClick={forecast.retry}>
          {t("chat.retry")}
        </button>
      </div>
    );
  }

  const skillJul = skillSummary(data, 1);
  const skillNow = skillSummary(data, data.lead);
  const season = seasonLabel(data, monthName);
  const levelLabel = unit ? t(`outlook.level.${unit.level}`, { macro: unit.macroregion ? t(`region.${unit.macroregion}`) : "" }) : "";

  return (
    <div className="grid gap-5">
      <header>
        <p className="m-0 text-xs text-muted">{levelLabel}</p>
        <h3 className="m-0 font-head text-xl font-extrabold">{unit && unit.level !== "department" ? t(`region.${unit.region}`) : unit?.name ?? unitId}</h3>
        <p className="m-0 text-sm text-muted">{t("outlook.season", { season })}</p>
      </header>

      {!unit || !unit.published ? (
        <div className="fc-empty">
          <p className="m-0 font-semibold">{t("outlook.none.title")}</p>
          <p className="m-0 mt-1 text-sm text-muted">{unit?.reason ?? t("outlook.none.text")}</p>
        </div>
      ) : (
        <>
          <MethodBadge unit={unit} />
          <div className="fc-forecast-block">
            <p className="m-0 text-xs text-muted">{t("outlook.median", { season })}</p>
            <p className="m-0 font-head text-[2.25rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-forecast tabular-nums">{formatNumber(unit.median, { maximumFractionDigits: 0 })}</p>
            <p className="m-0 text-sm text-muted">{t("outlook.unit")}</p>
            <p className="m-0 mt-1.5 text-sm tabular-nums">
              <span className="text-muted">{t("outlook.range", { level: pct(data.ci_level ?? 0.9) })}</span>{" "}
              <span className="font-semibold">
                {formatNumber(unit.low, { maximumFractionDigits: 0 })} – {formatNumber(unit.high, { maximumFractionDigits: 0 })}
              </span>
            </p>
            <div className="mt-3">
              <RangeStrip unit={unit} />
            </div>
          </div>

          <section aria-labelledby="prob-title">
            <h4 id="prob-title" className="fc-h">
              {t("outlook.probabilities")}
            </h4>
            <ProbabilityBar probabilities={unit.probabilities} climatology={unit.method === "model" ? data.climatology_probabilities : null} />
            <p className="m-0 mt-2 text-sm">
              {t("outlook.mostLikely", { cls: t(`anomaly.${unit.most_likely_class}`), p: pct(unit.probabilities[unit.most_likely_class]) })}
            </p>
          </section>
        </>
      )}

      {unit?.published && unit.level !== "department" && series.length > 0 && (
        <section aria-labelledby="history-title">
          <h4 id="history-title" className="fc-h">
            {t("outlook.history.title")}
          </h4>
          <SeasonHistory series={series} unit={unit} forecast={data} periods={periods} />
        </section>
      )}

      {unit?.skill_by_lead?.length > 0 && (
        <section aria-labelledby="skill-title" className="grid gap-2">
          <h4 id="skill-title" className="fc-h">
            {t("outlook.skill.title")}
          </h4>
          <SkillByLead unit={unit} />
          {skillJul && skillNow && (
            <>
              <p className="m-0 mt-1 text-sm leading-relaxed">
                {t("outlook.skill.line", { macro: skillJul.macro[0], macroN: skillJul.macro[1], dept: skillJul.dept[0], deptN: skillJul.dept[1] })}
              </p>
              <p className="m-0 text-xs leading-relaxed text-muted">
                {t("outlook.skill.now", { lead: data.lead, origin: data.origin, macro: skillNow.macro[0], macroN: skillNow.macro[1], dept: skillNow.dept[0], deptN: skillNow.dept[1] })}
              </p>
            </>
          )}
        </section>
      )}

      {unit && (
        <section aria-labelledby="oos-title" className="grid gap-2">
          <h4 id="oos-title" className="fc-h">
            {t("outlook.oos.title", { year: data.out_of_sample?.year ?? 2026 })}
          </h4>
          <OutOfSample forecast={data} unit={unit} />
        </section>
      )}

      <section aria-labelledby="next-title" className="grid gap-2">
        <h4 id="next-title" className="fc-h">
          {t("outlook.next")}
        </h4>
        {nextRows.length > 0 ? (
          <ul className="m-0 grid list-none gap-1 p-0 text-sm tabular-nums">
            {nextRows.map((r) => {
              const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
              const method = monthlyMethods?.find((m) => m.region === r.region && m.month === key)?.method;
              return (
                <li key={key} className="grid gap-0.5 rounded-lg border border-dashed border-forecast px-3 py-2">
                  <span className="flex justify-between gap-3">
                    <span className="font-semibold">
                      {monthName(r.month)} {r.year}
                    </span>
                    <span>
                      {formatNumber(r.estimated, { maximumFractionDigits: 0 })}{" "}
                      <span className="text-muted">
                        ({formatNumber(r.est_low, { maximumFractionDigits: 0 })} – {formatNumber(r.est_high, { maximumFractionDigits: 0 })})
                      </span>
                    </span>
                  </span>
                  <span className="text-xs text-forecast">
                    {t("explore.forecastTag")}
                    {method && ` · ${t(`outlook.method.${method}.short`)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{t("outlook.next.dept")}</p>
        )}
        <p className="m-0 text-xs leading-relaxed text-muted">{t("outlook.next.why")}</p>
      </section>

      <section aria-labelledby="dept-title">
        <h4 id="dept-title" className="fc-h">
          {t("outlook.departments")}
        </h4>
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {ranking.map((r) => {
            const p = chanceHigh(r);
            const on = r.region === unitId;
            return (
              <li key={r.region}>
                <button
                  type="button"
                  onClick={() => onSelectUnit(r.region)}
                  aria-current={on || undefined}
                  className={`fc-row grid w-full grid-cols-[minmax(0,1fr)_5rem_2.75rem_1.25rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${on ? "bg-surface-3" : ""}`}
                >
                  <span className="truncate">{r.name}</span>
                  {p === null ? (
                    <span className="col-span-2 text-xs text-muted">{t("outlook.noForecast")}</span>
                  ) : (
                    <>
                      <span aria-hidden="true" className="block h-1.5 rounded-full bg-surface-3">
                        <span className="block h-full rounded-full" style={{ width: `${p * 100}%`, background: "var(--forecast)" }} />
                      </span>
                      <span className="text-right tabular-nums">{pct(p)}</span>
                    </>
                  )}
                  <span className="text-center text-[10px] font-bold text-muted" title={r.method ? t(`outlook.method.${r.method}`) : ""}>
                    {r.method === "model" ? "M" : r.method === "climatology" ? "C" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="m-0 mt-2 text-[11px] text-muted">{t("outlook.departments.note")}</p>
      </section>

      <p className="m-0 text-xs leading-relaxed text-muted">{t("outlook.footer", { origin: data.origin, partial: data.excluded_partial_month })}</p>
    </div>
  );
}
