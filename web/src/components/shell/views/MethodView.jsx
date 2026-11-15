import { useI18n } from "../../../i18n/I18nProvider.jsx";
import HowWeCalculated from "../../HowWeCalculated.jsx";
import { DOC_ONLY, EVIDENCE_DOCS } from "../../../content/evidence.js";
import { skillSummary } from "../../../lib/forecast.js";
import { Preferences } from "../Rail.jsx";
import Icon from "../icons.jsx";

function Bars({ items, max = 1, format }) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0" aria-hidden="true">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-2 text-[11px]">
          <span className="truncate text-muted">{it.label}</span>
          <span className="block h-2 rounded-full bg-surface-3">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (it.value / max) * 100)}%`, background: it.color ?? "var(--c-est)" }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{format(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ id, claim, number, numberNote, children, href, tone }) {
  const { t } = useI18n();
  return (
    <article aria-labelledby={`ev-${id}`} className="fc-ev-card">
      <h4 id={`ev-${id}`} className="m-0 text-[15px] font-semibold leading-snug text-balance">
        {claim}
      </h4>
      {number && (
        <p className={`m-0 font-head text-[2rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums ${tone ?? "text-fg"}`}>
          {number}
          {numberNote && <span className="ml-2 align-middle font-body text-xs font-medium tracking-normal text-muted">{numberNote}</span>}
        </p>
      )}
      <div className="grid gap-2 text-sm leading-relaxed">{children}</div>
      {href && (
        <a href={href} target="_blank" rel="noopener" className="fc-link mt-auto inline-flex items-center gap-1 self-start text-xs">
          {t("how.source")} <Icon name="external" size={13} />
        </a>
      )}
    </article>
  );
}

export default function MethodView({ methodology, forecast, theme, onTheme, onOpenData }) {
  const { t, formatNumber } = useI18n();
  const pct = (v, d = 0) => formatNumber(v, { style: "percent", maximumFractionDigits: d });
  const findings = methodology?.findings;
  const gaps = findings?.calibration_overpass_gaps ?? [];
  const near = gaps.find((g) => g.gap_lower === 0);
  const far = gaps.filter((g) => g.gap_lower >= 20 && g.gap_upper && g.gap_upper <= 60);
  const emulator = methodology?.emulator;
  const drift = findings?.emulator_drift_latest?.by_region?.find((r) => r.region === "peru");
  const validation = methodology?.validation?.find((r) => r.region === "peru");
  const fc = forecast?.data;
  const skill = skillSummary(fc, 1);
  const oos = fc?.out_of_sample?.rows?.find((r) => r.region === "peru" && r.lead === 1 && r.published_method);
  const n0 = (v) => formatNumber(v, { maximumFractionDigits: 0 });
  const b = DOC_ONLY.bayes;
  const u = DOC_ONLY.underestimation;

  return (
    <div className="@container grid gap-8">
      <header className="grid gap-2">
        <h3 className="m-0 font-head text-2xl font-extrabold tracking-[-0.02em] text-balance">{t("how.title")}</h3>
        <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-muted">{t("how.lede")}</p>
      </header>

      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        <Card
          id="capture"
          claim={t("how.capture.claim")}
          number={near ? pct(near.coincidence) : null}
          numberNote={t("how.capture.note")}
          href={EVIDENCE_DOCS.capture}
          tone="text-est"
        >
          {gaps.length > 0 && (
            <Bars
              items={gaps
                .filter((g) => g.gap_upper)
                .map((g) => ({ label: t("how.capture.gap", { a: g.gap_lower, b: g.gap_upper }), value: g.coincidence, color: g.gap_lower === 0 ? "var(--c-est)" : "var(--line-strong)" }))}
              format={(v) => pct(v)}
            />
          )}
          <p className="m-0 text-muted">{t("how.capture.text", { far: far.length ? pct(Math.min(...far.map((g) => g.coincidence))) : "" })}</p>
        </Card>

        <Card id="emulator" claim={t("how.emulator.claim")} number={emulator ? formatNumber(emulator.auc, { maximumFractionDigits: 2 }) : null} numberNote={t("how.emulator.note", { fixed: formatNumber(DOC_ONLY.emulatorFixedRatioAuc, { maximumFractionDigits: 2 }) })} href={EVIDENCE_DOCS.emulator} tone="text-est">
          {drift && (
            <Bars
              items={[
                { label: t("how.emulator.emulated"), value: drift.emulated, color: "var(--c-est)" },
                { label: t("how.emulator.aqua"), value: drift.aqua, color: "var(--c-modis)" },
              ]}
              max={Math.max(drift.emulated, drift.aqua)}
              format={n0}
            />
          )}
          <p className="m-0 text-muted">{drift ? t("how.emulator.text", { pct: pct(drift.signed_annual_error_pct / 100) }) : t("method.unavailable")}</p>
        </Card>

        <Card id="bayes" claim={t("how.bayes.claim")} number={pct(b.persistence)} numberNote={t("how.bayes.note", { min: b.lagMinutes })} href={EVIDENCE_DOCS.bayes} tone="text-c-viirs">
          <Bars items={b.bySize.map((s) => ({ label: t(`how.bayes.size.${s.key}`), value: s.value, color: "var(--c-viirs)" }))} format={(v) => pct(v)} />
          <p className="m-0 text-muted">{t("how.bayes.text", { or: b.oddsRatio })}</p>
        </Card>

        <Card id="under" claim={t("how.under.claim")} number={`≈${pct(Math.abs(u.bias))}`} numberNote={t("how.under.note")} href={EVIDENCE_DOCS.underestimation} tone="text-amber">
          <div aria-hidden="true" className="grid gap-1 text-[11px]">
            <div className="relative h-3 rounded-full bg-surface-3">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(1 + u.bias) * 100}%`, background: "var(--c-est)" }} />
              <span className="absolute -inset-y-1 right-0 w-0 border-l-2 border-fg" />
            </div>
            <div className="flex justify-between text-muted">
              <span>{t("how.under.ours")}</span>
              <span>{t("how.under.truth")}</span>
            </div>
          </div>
          <p className="m-0 text-muted">{t("how.under.text", { n: u.estimatorsTested })}</p>
        </Card>

        <Card
          id="forecast"
          claim={t("how.forecast.claim")}
          number={skill ? `${skill.dept[0]}/${skill.dept[1]}` : null}
          numberNote={t("how.forecast.note")}
          href={EVIDENCE_DOCS.forecast}
          tone="text-forecast"
        >
          {skill && <p className="m-0">{t("how.forecast.skill", { macro: skill.macro[0], macroN: skill.macro[1] })}</p>}
          {oos && (
            <Bars
              items={[
                { label: t("how.forecast.predicted"), value: oos.median, color: "var(--forecast)" },
                { label: t("how.forecast.observed"), value: oos.observed, color: "var(--c-est)" },
              ]}
              max={Math.max(oos.median, oos.observed, oos.high)}
              format={n0}
            />
          )}
          <p className="m-0 text-muted">{oos ? t("how.forecast.text", { year: fc.out_of_sample.year, origin: oos.origin, low: n0(oos.low), high: n0(oos.high) }) : t("outlook.mock.title")}</p>
        </Card>

        <Card id="validation" claim={t("how.validation.claim")} number={validation ? `${formatNumber(validation.error_pct_method, { maximumFractionDigits: 1 })}%` : null} numberNote={t("how.validation.note")} href={EVIDENCE_DOCS.validation} tone="text-est">
          {validation && (
            <Bars
              items={[
                { label: t("how.validation.ours"), value: validation.error_pct_method, color: "var(--c-est)" },
                { label: t("how.validation.naive"), value: validation.error_pct_naive, color: "var(--c-raw)" },
              ]}
              max={validation.error_pct_naive}
              format={(v) => `${formatNumber(v, { maximumFractionDigits: v < 10 ? 1 : 0 })}%`}
            />
          )}
          {validation && <p className="m-0 text-muted">{t("how.validation.text", { r: formatNumber(validation.mapbiomas_corr, { maximumFractionDigits: 2 }), eras: formatNumber(DOC_ONLY.mapbiomasWithinEras, { maximumFractionDigits: 2 }) })}</p>}
        </Card>
      </div>

      <section aria-labelledby="limits-title" className="fc-ev-card !bg-transparent">
        <h4 id="limits-title" className="m-0 text-[15px] font-semibold">
          {t("how.limits.title")}
        </h4>
        <ul className="m-0 grid gap-x-8 gap-y-1.5 pl-4 text-sm leading-relaxed @3xl:grid-cols-2">
          {["lower", "coast", "early", "provisional", "unit"].map((k) => (
            <li key={k}>{t(`how.limits.${k}`)}</li>
          ))}
        </ul>
        <a href={EVIDENCE_DOCS.limits} target="_blank" rel="noopener" className="fc-link inline-flex items-center gap-1 self-start text-xs">
          {t("how.source")} <Icon name="external" size={13} />
        </a>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="fc-btn" onClick={onOpenData}>
          <Icon name="data" size={16} />
          {t("how.toData")}
        </button>
      </div>

      <details className="fc-details">
        <summary>{t("how.details")}</summary>
        <div className="mt-4">
          <HowWeCalculated methodology={methodology} region="peru" />
        </div>
      </details>
      <p className="m-0 text-xs text-muted">{t("unit.note")}</p>
      <div className="lg:hidden">
        <Preferences theme={theme} onTheme={onTheme} />
      </div>
    </div>
  );
}
