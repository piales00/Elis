import { useI18n } from "../i18n/I18nProvider.jsx";

const FACTS = ["modis", "viirs", "unit"];

export default function Hero() {
  const { t } = useI18n();
  return (
    <div className="border-b border-line bg-[radial-gradient(ellipse_at_top_right,rgb(194_65_12/0.14),transparent_55%)]">
      <div className="mx-auto max-w-[1180px] px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-accent">{t("hero.eyebrow")}</p>
        <h1 className="m-0 mt-3 max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          {t("hero.title")}
        </h1>
        <p className="mt-5 max-w-[62ch] text-lg text-muted sm:text-xl">{t("hero.lede")}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#false-record" className="rounded-md bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90">
            {t("hero.cta.record")}
          </a>
          <a href="#map" className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:bg-surface">
            {t("hero.cta.map")}
          </a>
        </div>
        <dl className="mt-12 grid gap-4 sm:grid-cols-3">
          {FACTS.map((key) => (
            <div key={key} className="rounded-xl border border-line bg-surface p-4">
              <dt className="font-semibold">{t(`hero.fact.${key}.title`)}</dt>
              <dd className="m-0 mt-1 text-sm text-muted">{t(`hero.fact.${key}.text`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
