import { LOCALES } from "../config.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { useActiveSection } from "../lib/hooks.js";

const LINKS = [
  ["record", "false-record"],
  ["map", "map"],
  ["clock", "fire-clock"],
  ["normal", "is-it-normal"],
  ["method", "method"],
  ["data", "data-check"],
];
const IDS = LINKS.map(([, id]) => id);

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c.6 3.2-1.2 4.6-2.6 6.3C8 10 7 11.4 7 13.6A5 5 0 0 0 12 19a5 5 0 0 0 5-5.1c0-2.1-1-3.5-2-4.7-.2 1.2-.8 2-1.7 2.4.5-3-.2-6.1-1.3-9.6Z"
        fill="var(--accent)"
      />
      <path d="M12 22c-2.2 0-4-1.1-4-2.6h8c0 1.5-1.8 2.6-4 2.6Z" fill="var(--fg)" />
    </svg>
  );
}

export default function Header({ regionIds, region, onRegionChange }) {
  const { t, locale, setLocale, languageName } = useI18n();
  const active = useActiveSection(IDS);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <a href="#top" className="flex items-center gap-2 text-fg no-underline">
          <Logo />
          <span className="font-head text-lg font-extrabold tracking-tight">{t("app.title")}</span>
        </a>

        <nav aria-label={t("nav.label")} className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto px-1 md:order-none md:w-auto">
          {LINKS.map(([key, id]) => (
            <a
              key={key}
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm no-underline transition-colors ${
                active === id ? "bg-accent font-semibold text-on-accent" : "text-muted hover:text-fg"
              }`}
            >
              {t(`nav.${key}`)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div role="group" aria-label={t("lang.label")} className="flex rounded-full border border-line bg-surface p-0.5">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={locale === code}
                aria-label={languageName(code)}
                title={languageName(code)}
                onClick={() => setLocale(code)}
                className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                  locale === code ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <span className="sr-only md:not-sr-only">{t("region.label")}</span>
            <select
              className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg"
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
            >
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
