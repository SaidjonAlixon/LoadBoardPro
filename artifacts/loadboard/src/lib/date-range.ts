export type DashboardDateRange = "thisWeek" | "lastWeek" | "thisMonth";
export type AccountingDatePreset = DashboardDateRange | "all" | "custom";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse YYYY-MM-DD as local calendar date (avoids UTC timezone shifts). */
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

function toIsoDate(d: Date): string {
  return toIsoDateLocal(d);
}

/** Monday of the calendar week (Mon–Sun) containing dateStr. */
export function getMondayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDateOnly(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDateLocal(d);
}

/** Snap any date to the Monday of its calendar week. */
export function normalizeWeekStart(weekStart: string): string {
  return getMondayOfWeek(weekStart);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  return toIsoDateLocal(d);
}

export function weekEndFromStart(weekStart: string): string {
  return addDays(normalizeWeekStart(weekStart), 6);
}

/** ISO week id e.g. 2026-25 for PID label */
export function getWeekPid(weekStart: string): string {
  const d = parseDateOnly(normalizeWeekStart(weekStart));
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4, 12, 0, 0, 0);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day);
  const diff = d.getTime() - week1Monday.getTime();
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-${String(week).padStart(2, "0")}`;
}

export function getThisWeekStart(): string {
  return getMondayOfWeek(toIsoDateLocal(new Date()));
}

export function getLastWeekStart(): string {
  return addDays(getThisWeekStart(), -7);
}

export function buildRecentWeekStarts(count = 20): string[] {
  const start = getThisWeekStart();
  return Array.from({ length: count }, (_, i) => addDays(start, -7 * i));
}

export function formatWeekRangeLabel(
  weekStart: string,
  formatDate: (d: string | Date) => string,
): string {
  const mon = normalizeWeekStart(weekStart);
  const end = weekEndFromStart(mon);
  return `${formatDate(mon)} – ${formatDate(end)}`;
}

export function getDashboardKpiParams(range: DashboardDateRange): {
  dateFrom?: string;
  dateTo?: string;
} {
  const today = toIsoDateLocal(new Date());

  if (range === "thisWeek") {
    const weekStart = getMondayOfWeek(today);
    return { dateFrom: weekStart, dateTo: weekEndFromStart(weekStart) };
  }

  if (range === "lastWeek") {
    const weekStart = addDays(getMondayOfWeek(today), -7);
    return { dateFrom: weekStart, dateTo: weekEndFromStart(weekStart) };
  }

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0, 0);
  return { dateFrom: toIsoDate(first), dateTo: toIsoDate(last) };
}

export function getDashboardRankingParams(range: DashboardDateRange): {
  weekStart?: string;
  dateFrom?: string;
  dateTo?: string;
} {
  if (range === "thisWeek") {
    const weekStart = getMondayOfWeek(toIsoDateLocal(new Date()));
    return { weekStart };
  }

  if (range === "lastWeek") {
    return { weekStart: addDays(getMondayOfWeek(toIsoDateLocal(new Date())), -7) };
  }

  return getDashboardKpiParams(range);
}

export function buildDashboardFilterParams(options: {
  dateRange: DashboardDateRange;
  weekFilters: string[];
  dispatcherFilter: string;
}): {
  dateFrom?: string;
  dateTo?: string;
  weekStart?: string;
  weekStarts?: string;
  dispatcherId?: string;
} {
  const params: {
    dateFrom?: string;
    dateTo?: string;
    weekStart?: string;
    weekStarts?: string;
    dispatcherId?: string;
  } = {};

  if (options.dispatcherFilter !== "all") {
    params.dispatcherId = options.dispatcherFilter;
  }

  const weeks = [...new Set((options.weekFilters ?? []).map(normalizeWeekStart).filter(Boolean))].sort();

  if (weeks.length === 1) {
    const mon = weeks[0]!;
    params.weekStart = mon;
    params.dateFrom = mon;
    params.dateTo = weekEndFromStart(mon);
    return params;
  }

  if (weeks.length > 1) {
    params.weekStarts = weeks.join(",");
    return params;
  }

  if (options.dateRange === "thisWeek" || options.dateRange === "lastWeek") {
    const ranking = getDashboardRankingParams(options.dateRange);
    params.weekStart = ranking.weekStart;
    if (ranking.weekStart) {
      params.dateFrom = ranking.weekStart;
      params.dateTo = weekEndFromStart(ranking.weekStart);
    }
  } else {
    Object.assign(params, getDashboardKpiParams(options.dateRange));
  }

  return params;
}
