/** Calendar date helpers — always use local date parts (no UTC day shifts). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(dateStr: string): Date {
  if (ISO_DATE.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIsoLocal(): string {
  return toIsoDateLocal(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  return toIsoDateLocal(d);
}

/** Monday of the calendar week containing dateStr (Mon–Sun). */
export function getMondayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDateOnly(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDateLocal(d);
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

/** Merge rows that belong to the same calendar week (Mon–Sun). */
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
