import { useI18n } from "../i18n/I18nProvider.jsx";

const FACTS = [
  ["modis", "var(--c-modis)"],
  ["viirs", "var(--c-viirs)"],
  ["unit", "var(--c-est)"],
];

export default function Hero() {
  const { t } = useI18n();
  return (
    <div id="top" className="border-b border-line">
      <div className="mx-auto max-w-[1240px] px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-3 w-9 overflow-hidden rounded-sm">
            <span className="w-1/3 bg-accent" />
            <span className="w-1/3 bg-fg" />
            <span className="w-1/3 bg-accent" />
          </span>
          <p className="eyebrow">{t("hero.eyebrow")}</p>
        </div>
        <h1 className="m-0 mt-4 max-w-[17ch] font-head text-4xl font-extrabold leading-[1.04] sm:text-6xl">{t("hero.title")}</h1>
        <p className="mt-5 max-w-[60ch] text-lg text-muted sm:text-xl">{t("hero.lede")}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#false-record" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white no-underline hover:brightness-110">
            {t("hero.cta.record")}
          </a>
          <a href="#map" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-fg no-underline hover:bg-surface">
            {t("hero.cta.map")}
          </a>
        </div>
        <dl className="mt-12 grid gap-4 sm:grid-cols-3">
          {FACTS.map(([key, color]) => (
            <div key={key} className="card p-5">
              <dt className="flex items-center gap-2 font-head font-bold">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: color }} />
                {t(`hero.fact.${key}.title`)}
              </dt>
              <dd className="m-0 mt-1.5 text-sm text-muted">{t(`hero.fact.${key}.text`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
