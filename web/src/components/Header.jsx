import { LOCALES } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

const selectClass = "rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg";
const LINKS = [
  ["record", "#false-record"],
  ["map", "#map"],
  ["clock", "#fire-clock"],
  ["normal", "#is-it-normal"],
  ["method", "#method"],
  ["data", "#data-check"],
];

export default function Header({ regionIds, region, onRegionChange }) {
  const { t, locale, setLocale, languageName } = useI18n();
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-accent" />
          <span className="text-lg font-semibold tracking-tight">{t("app.title")}</span>
        </div>
        <nav aria-label={t("nav.label")} className="order-3 flex w-full gap-5 text-sm sm:order-none sm:w-auto">
          {LINKS.map(([key, href]) => (
            <a key={key} href={href} className="text-muted hover:text-fg">
              {t(`nav.${key}`)}
            </a>
          ))}
        </nav>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <span>{t("lang.label")}</span>
            <select className={selectClass} value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <span>{t("region.label")}</span>
            <select className={selectClass} value={region} onChange={(e) => onRegionChange(e.target.value)}>
              {regionIds.map((id) => (
                <option key={id} value={id}>
                  {t(`region.${id}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
