/** All business calendar dates and display times use US Eastern Time. */
export const APP_TIMEZONE = "America/New_York";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type EtDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getEtParts(date: Date = new Date()): EtDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_MAP[parts.weekday ?? "Sun"] ?? 0,
  };
}

export function toIsoDateFromParts(parts: Pick<EtDateParts, "year" | "month" | "day">): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function todayIsoLocal(): string {
  return toIsoDateFromParts(getEtParts());
}

export function instantToIsoDate(date: Date): string {
  return toIsoDateFromParts(getEtParts(date));
}

export function parseDateOnly(dateStr: string): Date {
  if (ISO_DATE.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  const p = getEtParts(d);
  return new Date(p.year, p.month - 1, p.day, 12, 0, 0, 0);
}

export function toIsoDateLocal(d: Date): string {
  return instantToIsoDate(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  return toIsoDateFromParts({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}

export function getMondayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDateOnly(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDateFromParts({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}

export function normalizeWeekStart(weekStart: string): string {
  return getMondayOfWeek(weekStart);
}

export function getThisWeekStart(): string {
  return getMondayOfWeek(todayIsoLocal());
}

export function weekEndFromStart(weekStart: string): string {
  return addDays(normalizeWeekStart(weekStart), 6);
}

export function weekDayDiff(fromDate: string, toDate: string): number {
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function computeLoadWeekMoveDates(
  load: { weekStart: string; puDate: string; delDate: string },
  targetWeekStart: string,
): { weekStart: string; puDate: string; delDate: string } {
  const targetMonday = normalizeWeekStart(targetWeekStart);
  const puBase = String(load.puDate).split("T")[0];
  const delBase = String(load.delDate).split("T")[0];
  const sourceMonday = normalizeWeekStart(load.weekStart || puBase);
  const puOffset = weekDayDiff(sourceMonday, puBase);
  const delSpan = Math.max(0, weekDayDiff(puBase, delBase));
  const newPu = addDays(targetMonday, puOffset);
  const newDel = addDays(newPu, delSpan);
  return { weekStart: targetMonday, puDate: newPu, delDate: newDel };
}

export function isDateInWeek(dateStr: string, weekStartMonday: string): boolean {
  const mon = normalizeWeekStart(weekStartMonday);
  const sun = weekEndFromStart(mon);
  return dateStr >= mon && dateStr <= sun;
}

export type WeekBucket = {
  weekStart: string;
  weekEnd: string;
  loadCount: number;
  totalGross: number;
};

export function mergeWeekBuckets(
  rows: { weekStart: string; loadCount?: number; totalGross?: number }[],
): WeekBucket[] {
  const map = new Map<string, WeekBucket>();
  for (const row of rows) {
    const mon = normalizeWeekStart(row.weekStart);
    const existing = map.get(mon);
    if (existing) {
      existing.loadCount += row.loadCount ?? 0;
      existing.totalGross += row.totalGross ?? 0;
    } else {
      map.set(mon, {
        weekStart: mon,
        weekEnd: weekEndFromStart(mon),
        loadCount: row.loadCount ?? 0,
        totalGross: row.totalGross ?? 0,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function getEtMonthRange(date: Date = new Date()): { dateFrom: string; dateTo: string } {
  const p = getEtParts(date);
  const lastDay = new Date(p.year, p.month + 1, 0).getDate();
  return {
    dateFrom: `${p.year}-${String(p.month).padStart(2, "0")}-01`,
    dateTo: `${p.year}-${String(p.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isSameEtDay(a: Date, b: Date): boolean {
  const pa = getEtParts(a);
  const pb = getEtParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** Convert an Eastern wall-clock YYYY-MM-DDTHH:mm to a UTC instant. */
export function etWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const guess = new Date(utcMs);
    const parts: Record<string, string> = {};
    for (const p of formatter.formatToParts(guess)) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }
    const shownUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
    );
    const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
    const diff = shownUtc - targetUtc;
    if (diff === 0) return guess;
    utcMs -= diff;
  }
  return new Date(utcMs);
}

export function formatInEt(
  date: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const d =
    typeof date === "string" && ISO_DATE.test(date)
      ? parseDateOnly(date)
      : new Date(date);
  return new Intl.DateTimeFormat(locale, { timeZone: APP_TIMEZONE, ...options }).format(d);
}
