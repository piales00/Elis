import { useI18n } from "../../../i18n/I18nProvider.jsx";
import HowWeCalculated from "../../HowWeCalculated.jsx";
import { DOC_ONLY, EVIDENCE_DOCS, REPORT_PDF } from "../../../content/evidence.js";
import { skillSummary } from "../../../lib/forecast.js";
import { ElisMark, Preferences } from "../Rail.jsx";
import Icon from "../icons.jsx";
import Attributions from "../Attributions.jsx";

function Bars({ items, max = 1, format }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0" aria-hidden="true">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
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

function docName(href) {
  return href.split("/").pop();
}

function Card({ id, claim, number, numberNote, range, visual, children, href, tone, span, span2, forecast }) {
  const { t } = useI18n();
  const figure = number && (
    <p className="fc-figure">
      <span className={`fc-figure-num ${tone ?? "text-fg"}`}>{number}</span>
      {numberNote && <span className="fc-figure-note">{numberNote}</span>}
      {range && <span className="fc-figure-range">{range}</span>}
    </p>
  );
  return (
    <article aria-labelledby={`ev-${id}`} className="fc-ev-card" data-span={span || undefined} data-span2={span2 || undefined} data-forecast={forecast || undefined}>
      {forecast && <span className="self-start rounded-md border border-dashed border-forecast px-1.5 py-0.5 text-[11px] font-bold text-forecast">{t("status.forecast")}</span>}
      <h4 id={`ev-${id}`} className="m-0 max-w-[46ch] font-head text-[16px] font-bold leading-snug text-balance">
        {claim}
      </h4>
      {span ? (
        <div className="fc-ev-hero">
          <div className="grid gap-4">
            {figure}
            {children && <p className="m-0 max-w-[60ch] text-sm leading-relaxed text-muted">{children}</p>}
          </div>
          {visual}
        </div>
      ) : (
        <>
          {figure}
          {visual}
          {children && (
            <details className="fc-disclosure">
              <summary>
                <span>{t("how.more")}</span>
                <Icon name="chevron" size={14} className="fc-disclosure-chev" />
              </summary>
              <p className="m-0 pt-2 text-sm leading-relaxed text-muted">{children}</p>
            </details>
          )}
        </>
      )}
      {href && (
        <div className="fc-ev-foot">
          <a href={href} target="_blank" rel="noopener" className="fc-source" aria-label={`${t("how.source")}: ${docName(href)}`}>
            <Icon name="method" size={14} />
            <code>{docName(href)}</code>
            <Icon name="external" size={12} />
          </a>
        </div>
      )}
    </article>
  );
}

function Flow() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="flow-title" className="grid gap-3">
      <h4 id="flow-title" className="fc-section-title">
        {t("how.flow.title")}
      </h4>
      <ol className="fc-flow">
        {[1, 2, 3, 4].map((n) => (
          <li key={n} className="fc-flow-step" data-forecast={n === 4 || undefined}>
            <span className="fc-flow-num" aria-hidden="true">
              {n}
            </span>
            <span className="text-sm font-bold">{t(`how.flow.${n}.title`)}</span>
            <span className="text-[13px] leading-relaxed text-muted">{t(`how.flow.${n}.text`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function MethodView({ methodology, forecast, theme, onTheme, onOpenData }) {
  const { t, formatNumber } = useI18n();
  const pct = (v, d = 0) => formatNumber(v, { style: "percent", maximumFractionDigits: d });
  const findings = methodology?.findings;
  const gaps = findings?.calibration_overpass_gaps ?? [];
  const near = gaps.find((g) => g.gap_lower === 0);
  const far = gaps.filter((g) => g.gap_lower >= 20 && g.gap_upper && g.gap_upper <= 60);
  const farMin = far.length ? pct(Math.min(...far.map((g) => g.coincidence))) : null;
  const emulator = methodology?.emulator;
  const drift = findings?.emulator_drift_latest?.by_region?.find((r) => r.region === "peru");
  const validation = methodology?.validation?.find((r) => r.region === "peru");
  const fc = forecast?.data;
  const skill = skillSummary(fc, 1);
  const oos = fc?.out_of_sample?.rows?.find((r) => r.region === "peru" && r.lead === 1 && r.published_method);
  const n0 = (v) => formatNumber(v, { maximumFractionDigits: 0 });
  const n2 = (v) => formatNumber(v, { maximumFractionDigits: 2 });
  const f2 = (v) => formatNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const b = DOC_ONLY.bayes;
  const u = DOC_ONLY.underestimation;
  const errFmt = (v) => `${formatNumber(v, { maximumFractionDigits: v < 10 ? 1 : 0 })}%`;

  return (
    <div className="@container grid gap-10">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="grid max-w-[68ch] gap-2">
          <p className="m-0 font-head text-[clamp(1.5rem,1.2rem+0.9vw,2rem)] font-extrabold leading-tight tracking-[-0.02em] text-balance">{t("how.headline")}</p>
          <p className="m-0 text-[15px] leading-relaxed text-muted">{t("how.lede")}</p>
        </div>
        <div className="grid justify-items-start gap-3 @3xl:justify-items-end">
          <p className="m-0 inline-flex items-center gap-2 text-sm font-semibold">
            <ElisMark size={26} />
            {t("how.brand")}
          </p>
          <div className="flex flex-wrap items-center gap-2 @3xl:justify-end">
            <a href={REPORT_PDF} download className="fc-btn fc-btn-primary">
              <Icon name="download" size={16} />
              {t("how.report")}
            </a>
            <a href={EVIDENCE_DOCS.index} target="_blank" rel="noopener" className="fc-btn">
              {t("how.notes")}
              <Icon name="external" size={14} />
            </a>
          </div>
          <p className="m-0 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs">
            <span className="font-semibold">{t("how.unitLabel")}</span>
            <span className="text-muted">{t("unit.short")}</span>
          </p>
        </div>
      </header>

      <Flow />

      <section aria-labelledby="evidence-title" className="grid gap-3">
        <h4 id="evidence-title" className="fc-section-title">
          {t("how.evidence")}
        </h4>
        <div className="fc-evidence">
          <Card
            id="capture"
            span
            claim={t("how.capture.claim")}
            number={near ? pct(near.coincidence) : null}
            numberNote={t("how.capture.note")}
            range={farMin ? t("how.range.capture", { far: farMin }) : null}
            href={EVIDENCE_DOCS.capture}
            tone="text-est"
            visual={
              gaps.length > 0 && (
                <div className="grid gap-2">
                  <p className="m-0 text-xs font-semibold text-muted">{t("how.capture.chart")}</p>
                  <Bars
                    items={gaps
                      .filter((g) => g.gap_upper)
                      .map((g) => ({ label: t("how.capture.gap", { a: g.gap_lower, b: g.gap_upper }), value: g.coincidence, color: g.gap_lower === 0 ? "var(--c-est)" : "var(--line-strong)" }))}
                    format={(v) => pct(v)}
                  />
                </div>
              )
            }
          >
            {t("how.capture.text", { far: farMin ?? "" })}
          </Card>

          <Card
            id="validation"
            claim={t("how.validation.claim")}
            number={validation ? errFmt(validation.error_pct_method) : null}
            numberNote={t("how.validation.note")}
            range={validation ? t("how.range.validation", { naive: errFmt(validation.error_pct_naive) }) : null}
            href={EVIDENCE_DOCS.validation}
            tone="text-est"
            visual={
              validation && (
                <Bars
                  items={[
                    { label: t("how.validation.ours"), value: validation.error_pct_method, color: "var(--c-est)" },
                    { label: t("how.validation.naive"), value: validation.error_pct_naive, color: "var(--c-raw)" },
                  ]}
                  max={validation.error_pct_naive}
                  format={errFmt}
                />
              )
            }
          >
            {validation ? t("how.validation.text", { r: n2(validation.mapbiomas_corr), eras: n2(DOC_ONLY.mapbiomasWithinEras) }) : null}
          </Card>

          <Card
            id="emulator"
            claim={t("how.emulator.claim")}
            number={emulator ? n2(emulator.auc) : null}
            numberNote={t("how.emulator.note", { fixed: n2(DOC_ONLY.emulatorFixedRatioAuc) })}
            href={EVIDENCE_DOCS.emulator}
            tone="text-est"
            visual={
              drift && (
                <Bars
                  items={[
                    { label: t("how.emulator.emulated"), value: drift.emulated, color: "var(--c-est)" },
                    { label: t("how.emulator.aqua"), value: drift.aqua, color: "var(--c-modis)" },
                  ]}
                  max={Math.max(drift.emulated, drift.aqua)}
                  format={n0}
                />
              )
            }
          >
            {drift ? t("how.emulator.text", { pct: pct(drift.signed_annual_error_pct / 100) }) : t("method.unavailable")}
          </Card>

          <Card
            id="bayes"
            claim={t("how.bayes.claim")}
            number={pct(b.persistence)}
            numberNote={t("how.bayes.note", { min: b.lagMinutes })}
            href={EVIDENCE_DOCS.bayes}
            tone="text-c-viirs"
            visual={<Bars items={b.bySize.map((s) => ({ label: t(`how.bayes.size.${s.key}`), value: s.value, color: "var(--c-viirs)" }))} format={(v) => pct(v)} />}
          >
            {t("how.bayes.text", { or: b.oddsRatio })}
          </Card>

          <Card
            id="under"
            claim={t("how.under.claim")}
            number={`≈${pct(Math.abs(u.bias))}`}
            numberNote={t("how.under.note")}
            range={t("how.range.under", { f: f2(u.factor), lo: f2(u.factorRange[0]), hi: f2(u.factorRange[1]) })}
            href={EVIDENCE_DOCS.underestimation}
            tone="text-amber"
            visual={
              <div aria-hidden="true" className="grid gap-1.5 text-[11px]">
                <div className="relative h-2.5 rounded-full bg-surface-3">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(1 + u.bias) * 100}%`, background: "var(--c-est)" }} />
                  <span className="absolute -inset-y-1 right-0 w-0 border-l-2 border-fg" />
                </div>
                <div className="flex justify-between text-muted">
                  <span>{t("how.under.ours")}</span>
                  <span>{t("how.under.truth")}</span>
                </div>
              </div>
            }
          >
            {t("how.under.text", { n: u.estimatorsTested })}
          </Card>

          <Card
            id="forecast"
            forecast
            span2
            claim={t("how.forecast.claim")}
            number={skill ? `${skill.dept[0]}/${skill.dept[1]}` : null}
            numberNote={t("how.forecast.note")}
            range={skill ? t("how.forecast.skill", { macro: skill.macro[0], macroN: skill.macro[1] }) : null}
            href={EVIDENCE_DOCS.forecast}
            tone="text-forecast"
            visual={
              oos && (
                <Bars
                  items={[
                    { label: t("how.forecast.predicted"), value: oos.median, color: "var(--forecast)" },
                    { label: t("how.forecast.observed"), value: oos.observed, color: "var(--c-est)" },
                  ]}
                  max={Math.max(oos.median, oos.observed, oos.high)}
                  format={n0}
                />
              )
            }
          >
            {oos ? t("how.forecast.text", { year: fc.out_of_sample.year, origin: oos.origin, low: n0(oos.low), high: n0(oos.high) }) : t("outlook.mock.title")}
          </Card>
          <section aria-labelledby="limits-title" data-span className="fc-ev-card fc-limits-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 id="limits-title" className="fc-section-title">
                {t("how.limits.title")}
              </h4>
              <a href={EVIDENCE_DOCS.limits} target="_blank" rel="noopener" className="fc-source" aria-label={`${t("how.source")}: ${docName(EVIDENCE_DOCS.limits)}`}>
                <Icon name="method" size={14} />
                <code>{docName(EVIDENCE_DOCS.limits)}</code>
                <Icon name="external" size={12} />
              </a>
            </div>
            <ul className="fc-limits">
              {["lower", "coast", "early", "provisional", "unit"].map((k) => (
                <li key={k}>{t(`how.limits.${k}`)}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>


      <Attributions id="method-sources" />

      <details className="fc-disclosure fc-disclosure-card">
        <summary>
          <span>{t("how.details")}</span>
          <Icon name="chevron" size={16} className="fc-disclosure-chev" />
        </summary>
        <div className="mt-2">
          <HowWeCalculated methodology={methodology} region="peru" />
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <p className="m-0 max-w-[70ch] text-xs leading-relaxed text-muted">{t("unit.note")}</p>
        <button type="button" className="fc-btn fc-btn-primary" onClick={onOpenData}>
          <Icon name="data" size={16} />
          {t("how.toData")}
        </button>
      </div>
      <div className="lg:hidden">
        <Preferences theme={theme} onTheme={onTheme} />
      </div>
    </div>
  );
}
