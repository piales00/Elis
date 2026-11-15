import { useI18n } from "../i18n/I18nProvider.jsx";
import { LIMITS, PENDING, SOURCES, STEPS } from "../content/sources.js";

function Card({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="m-0 text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function PendingBadge() {
  const { t } = useI18n();
  return (
    <span className="ml-2 rounded border border-dashed border-forecast px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-forecast">
      {t("method.pending.badge")}
    </span>
  );
}

function PairBar({ label, value, max, color, hatched, text }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill = hatched
    ? `repeating-linear-gradient(45deg, ${color}, ${color} 3px, transparent 3px, transparent 6px)`
    : color;
  return (
    <div className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span aria-hidden="true" className="block h-3 rounded-sm bg-surface-2">
        <span className="block h-full rounded-sm" style={{ width: `${pct}%`, background: fill, border: `1px solid ${color}` }} />
      </span>
      <span className="text-right tabular-nums">{text}</span>
    </div>
  );
}

export default function HowWeCalculated({ methodology, region }) {
  const { t, formatNumber } = useI18n();
  const pct = (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 });
  const pct1 = (v) => `${formatNumber(v, { maximumFractionDigits: 1 })}%`;
  const params = methodology?.params;
  const detection = (methodology?.detection ?? []).slice().sort((a, b) => a.month - b.month);
  const validation = methodology?.validation ?? [];
  const regionName = t(`region.${region}`);
  const range = (a) => (Array.isArray(a) ? a.join("–") : t("series.na"));

  return (
    <div className="@container grid gap-6">
      <div className="grid gap-4 @2xl:grid-cols-3">
        {["observed", "estimate", "forecast"].map((k) => (
          <Card key={k} title={t(`method.kind.${k}.title`)}>
            <p className="m-0 mt-2 text-muted">{t(`method.kind.${k}.text`)}</p>
          </Card>
        ))}
      </div>

      <Card title={t("method.steps.title")}>
        <ol className="m-0 mt-4 grid list-none gap-4 p-0 @xl:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-sm font-semibold">
                {i + 1}
              </span>
              <div>
                <p className="m-0 font-semibold">{t(`method.step.${s}.title`)}</p>
                <p className="m-0 mt-1 text-sm text-muted">{t(`method.step.${s}.text`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Card title={t("method.params.title")}>
          {params ? (
            <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-muted">{t("method.params.grid")}</dt>
              <dd className="m-0 text-right">{formatNumber(params.grid_deg)}</dd>
              <dt className="text-muted">{t("method.params.calibration")}</dt>
              <dd className="m-0 text-right">{range(params.calibration_years)}</dd>
              <dt className="text-muted">{t("method.params.test")}</dt>
              <dd className="m-0 text-right">{range(params.test_years)}</dd>
            </dl>
          ) : (
            <p className="m-0 mt-3 text-sm text-muted">
              {t("method.unavailable")}
              <PendingBadge />
            </p>
          )}
        </Card>

        <Card title={t("method.valid.title")}>
          <p className="m-0 mt-1 text-sm text-muted">{t("method.valid.sub", { region: regionName })}</p>
          {validation.length ? (
            validation.map((v) => {
              const top = Math.max(v.error_pct_method, v.error_pct_naive);
              return (
                <div key={v.region} className="mt-3 grid gap-1.5">
                  <PairBar label={t("method.valid.method")} value={v.error_pct_method} max={top} color="var(--c-est)" text={pct1(v.error_pct_method)} />
                  <PairBar label={t("method.valid.naive")} value={v.error_pct_naive} max={top} color="var(--c-raw)" hatched text={pct1(v.error_pct_naive)} />
                  <p className="m-0 mt-1 text-sm">
                    <span className="text-muted">{t("method.valid.corr")}: </span>
                    {v.mapbiomas_corr === null || v.mapbiomas_corr === undefined ? (
                      <>
                        {t("series.na")}
                        <PendingBadge />
                      </>
                    ) : (
                      <span className="font-semibold tabular-nums">{formatNumber(v.mapbiomas_corr, { maximumFractionDigits: 2 })}</span>
                    )}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="m-0 mt-3 text-sm text-muted">
              {t("method.valid.empty")}
              <PendingBadge />
            </p>
          )}
        </Card>
      </div>

      <Card title={t("method.detect.title")}>
        <p className="m-0 mt-1 text-sm text-muted">{t("method.detect.sub", { region: regionName })}</p>
        {detection.length ? (
          <div className="mt-4 grid gap-4 @md:grid-cols-2 @3xl:grid-cols-3">
            {detection.map((d) => (
              <div key={`${d.region}-${d.month}`} className="grid gap-1.5">
                <p className="m-0 font-semibold">{t(`month.${d.month}`)}</p>
                <PairBar label={t("method.detect.modis")} value={d.p_modis} max={1} color="var(--c-modis)" text={pct(d.p_modis)} />
                <PairBar label={t("method.detect.viirs")} value={d.p_viirs} max={1} color="var(--c-viirs)" hatched text={pct(d.p_viirs)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 mt-3 text-sm text-muted">
            {t("method.detect.empty")}
            <PendingBadge />
          </p>
        )}
      </Card>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Card title={t("method.limits.title")}>
          <ul className="m-0 mt-3 grid list-disc gap-2 pl-5 text-sm">
            {LIMITS.map((l) => (
              <li key={l}>{t(`method.limit.${l}`)}</li>
            ))}
          </ul>
        </Card>

        <Card title={t("method.sources.title")}>
          <ul className="m-0 mt-3 grid list-none gap-3 p-0 text-sm">
            {SOURCES.map((s) => (
              <li key={s.key}>
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-sat underline underline-offset-2">
                  {t(`method.source.${s.key}.name`)}
                </a>
                <span className="block text-muted">{t(`method.source.${s.key}.text`)}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-4 text-sm text-muted">{t("method.firms.ack")}</p>
        </Card>
      </div>

      <div className="grid gap-4 @2xl:grid-cols-2">
        <Card title={t("method.ai.title")}>
          <p className="m-0 mt-2 text-sm text-muted">{t("method.ai.text")}</p>
        </Card>
        <Card title={t("method.pending.title")}>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-sm">
            {PENDING.map((p) => (
              <li key={p}>
                {t(`method.pending.${p}`)}
                <PendingBadge />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
