import { useI18n } from "../../i18n/I18nProvider.jsx";
import { LOCALES } from "../../config.js";
import Icon from "./icons.jsx";

export const VIEWS = ["explore", "compare", "year", "outlook", "ask", "method"];

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c.6 3.2-1.2 4.6-2.6 6.3C8 10 7 11.4 7 13.6A5 5 0 0 0 12 19a5 5 0 0 0 5-5.1c0-2.1-1-3.5-2-4.7-.2 1.2-.8 2-1.7 2.4.5-3-.2-6.1-1.3-9.6Z"
        fill="var(--accent)"
      />
      <path d="M12 22c-2.2 0-4-1.1-4-2.6h8c0 1.5-1.8 2.6-4 2.6Z" fill="var(--fg)" />
    </svg>
  );
}

export function Preferences({ theme, onTheme, vertical = false }) {
  const { t, locale, setLocale, languageName } = useI18n();
  return (
    <div className={`flex items-center gap-1.5 ${vertical ? "flex-col" : ""}`}>
      <button
        type="button"
        onClick={onTheme}
        aria-label={t(theme === "dark" ? "theme.toLight" : "theme.toDark")}
        title={t(theme === "dark" ? "theme.toLight" : "theme.toDark")}
        className="fc-icon-btn"
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
      </button>
      <div role="group" aria-label={t("lang.label")} className={`flex rounded-lg border border-line p-0.5 ${vertical ? "flex-col" : ""}`}>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={locale === code}
            aria-label={languageName(code)}
            title={languageName(code)}
            onClick={() => setLocale(code)}
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase ${locale === code ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Rail({ view, panelOpen, onSelect, onTour, theme, onTheme }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("rail.label")} className="fc-rail">
      <div className="hidden flex-col items-center gap-1 pb-2 pt-3 lg:flex" title={t("app.title")}>
        <Logo />
      </div>
      <ul className="fc-rail-list">
        {VIEWS.map((v, i) => {
          const on = view === v;
          return (
            <li key={v} className="contents">
              <button
                type="button"
                onClick={() => onSelect(v)}
                aria-current={on ? "page" : undefined}
                aria-expanded={on ? panelOpen : undefined}
                aria-keyshortcuts={String(i + 1)}
                title={`${t(`view.${v}`)} (${i + 1})`}
                className="fc-rail-item"
                data-on={on || undefined}
              >
                <Icon name={v} size={22} />
                <span className="fc-rail-label">{t(`view.${v}.short`)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto hidden flex-col items-center gap-2 pb-3 lg:flex">
        <button type="button" onClick={onTour} className="fc-rail-item" title={t("tour.start")}>
          <Icon name="tour" size={22} />
          <span className="fc-rail-label">{t("tour.short")}</span>
        </button>
        <Preferences theme={theme} onTheme={onTheme} vertical />
      </div>
    </nav>
  );
}
