import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALES } from "../config.js";
import en from "./locales/en.js";
import es from "./locales/es.js";

const dictionaries = { en, es };
const STORAGE_KEY = "fc.locale";

const I18nContext = createContext(null);

function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LOCALES.includes(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStored);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((code) => {
    const next = LOCALES.includes(code) ? code : DEFAULT_LOCALE;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const value = useMemo(() => {
    const t = (key, vars) => {
      let text = dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
      if (vars) {
        for (const [name, v] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(v));
      }
      return text;
    };
    const formatNumber = (n) => new Intl.NumberFormat(locale).format(n);
    const languageName = (code) => dictionaries[code]["lang.name"];
    return { locale, setLocale, t, formatNumber, languageName };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
