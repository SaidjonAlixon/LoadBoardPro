import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./en";
import uz from "./uz";
import { parseDateOnly } from "../date-range";

export type Locale = "en" | "uz";

const STORAGE_KEY = "lb_locale";

const catalogs: Record<Locale, Record<string, unknown>> = { en, uz };

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const val = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  return typeof val === "string" ? val : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`,
  );
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatCurrency: (amount?: number) => string;
  formatDate: (date: string | Date) => string;
  formatNumber: (n: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "uz" || saved === "en" ? saved : "uz";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.title = locale === "uz" ? "LoadBoardPro — Yuk boshqaruvi" : "LoadBoardPro — Freight Management";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const catalog = catalogs[locale] as Record<string, unknown>;
      const fallback = catalogs.en as Record<string, unknown>;
      const text = getNested(catalog, key) ?? getNested(fallback, key) ?? key;
      return interpolate(text, vars);
    },
    [locale],
  );

  const intlLocale = locale === "uz" ? "uz-UZ" : "en-US";

  const formatCurrency = useCallback(
    (amount = 0) =>
      new Intl.NumberFormat(intlLocale, { style: "currency", currency: "USD" }).format(amount),
    [intlLocale],
  );

  const formatDate = useCallback(
    (date: string | Date) => {
      const d =
        typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? parseDateOnly(date)
          : new Date(date);
      return new Intl.DateTimeFormat(intlLocale).format(d);
    },
    [intlLocale],
  );

  const formatNumber = useCallback(
    (n: number) => new Intl.NumberFormat(intlLocale).format(n),
    [intlLocale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, formatCurrency, formatDate, formatNumber }),
    [locale, setLocale, t, formatCurrency, formatDate, formatNumber],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
