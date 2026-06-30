import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import en from "./en";
import { APP_TIMEZONE, formatInEt, parseDateOnly } from "@workspace/calendar";

export type Locale = "en";

const INTL_LOCALE = "en-US";

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
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatCurrency: (amount?: number) => string;
  formatDate: (date: string | Date) => string;
  formatDateTime: (date: string | Date) => string;
  formatNumber: (n: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    localStorage.removeItem("lb_locale");
    document.documentElement.lang = "en";
    document.title = "LoadBoardPro — Freight Management";
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const catalog = en as Record<string, unknown>;
    const text = getNested(catalog, key) ?? key;
    return interpolate(text, vars);
  }, []);

  const formatCurrency = useCallback(
    (amount = 0) =>
      new Intl.NumberFormat(INTL_LOCALE, { style: "currency", currency: "USD" }).format(amount),
    [],
  );

  const formatDate = useCallback((date: string | Date) => {
    const d =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? parseDateOnly(date)
        : new Date(date);
    return new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: APP_TIMEZONE }).format(d);
  }, []);

  const formatDateTime = useCallback(
    (date: string | Date) =>
      formatInEt(date, INTL_LOCALE, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    [],
  );

  const formatNumber = useCallback(
    (n: number) => new Intl.NumberFormat(INTL_LOCALE).format(n),
    [],
  );

  const value = useMemo(
    () => ({ locale: "en" as const, t, formatCurrency, formatDate, formatDateTime, formatNumber }),
    [t, formatCurrency, formatDate, formatDateTime, formatNumber],
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
