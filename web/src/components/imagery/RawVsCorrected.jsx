import { useI18n } from "../../i18n/I18nProvider.jsx";

function pickRow(rows, series, region, extra = () => true) {
  const list = (rows ?? []).filter((r) => r.series === series && extra(r));
  return list.find((r) => r.region === region) ?? list.find((r) => r.region === "peru") ?? null;
}

export default function RawVsCorrected({ methodology, region, regionLabel }) {
  const { t, formatNumber } = useI18n();
  const demo = methodology?.forecast?.raw_vs_corrected;
  if (!demo?.trend?.length) return null;

  const monthLead1 = (r) => r.target === "month" && r.lead === 1;
  const sides = ["raw_detections", "estimated"].map((series) => ({
    series,
    trend: pickRow(demo.trend, series, region),
    cross: pickRow(demo.cross_2012, series, region, monthLead1),
  }));
  if (sides.some((s) => !s.trend)) return null;

  const shownRegion = sides[0].trend.region;
  const pct = (v) => `${v > 0 ? "+" : ""}${formatNumber(v, { maximumFractionDigits: 1 })}%`;
  const times = (v) => `×${formatNumber(v, { maximumFractionDigits: v >= 10 ? 0 : 2 })}`;
  const years = sides[0].trend.years;

  return (
    <section aria-labelledby="raw-vs-corrected-title" className="@container card mt-6 p-4 sm:p-6">
      <p className="eyebrow">{t("rvc.eyebrow")}</p>
      <h3 id="raw-vs-corrected-title" className="m-0 mt-1 font-head text-2xl font-extrabold">
        {t("rvc.title")}
      </h3>
      <p className="m-0 mt-2 max-w-3xl text-sm text-muted">
        {t("rvc.lede", {
          region: shownRegion === region ? regionLabel : t("region.peru"),
          train: `${demo.train_years[0]}–${demo.train_years[1]}`,
          test: `${demo.test_years[0]}–${demo.test_years[1]}`,
        })}
      </p>
      <div className="mt-4 grid gap-3 @md:grid-cols-2">
        {sides.map(({ series, trend, cross }) => {
          const raw = series === "raw_detections";
          return (
            <div key={series} className={`card-soft p-4 ${raw ? "border-danger" : "border-sat"}`}>
              <p className={`m-0 text-sm font-bold ${raw ? "text-danger" : "text-sat"}`}>{t(raw ? "rvc.raw" : "rvc.corrected")}</p>
              <p className="m-0 mt-2 font-head text-3xl font-extrabold tabular-nums">{pct(trend.pct_per_year)}</p>
              <p className="m-0 text-sm text-muted">{t("rvc.perYear", { from: years[0], to: years[1] })}</p>
              <p className="m-0 mt-2 text-sm tabular-nums">{t("rvc.fitted", { value: times(trend.fitted_last_over_first), from: years[0], to: years[1] })}</p>
              {cross && (
                <p className="m-0 mt-1 text-sm tabular-nums">
                  {t("rvc.cross", { value: times(cross.median_observed_over_predicted) })}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-3 text-xs text-muted">{t("rvc.note")}</p>
    </section>
  );
}
