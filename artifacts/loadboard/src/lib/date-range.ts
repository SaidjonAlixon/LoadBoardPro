export type DashboardDateRange = "thisWeek" | "lastWeek" | "thisMonth";
export type AccountingDatePreset = DashboardDateRange | "all" | "custom";

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDate(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** ISO week id e.g. 2026-25 for PID label */
export function getWeekPid(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day);
  const diff = d.getTime() - week1Monday.getTime();
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-${String(week).padStart(2, "0")}`;
}

export function getThisWeekStart(): string {
  return getMondayOfWeek(toIsoDate(new Date()));
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
  const end = addDays(weekStart, 6);
  return `${formatDate(weekStart)} – ${formatDate(end)}`;
}

export function getDashboardKpiParams(range: DashboardDateRange): {
  dateFrom?: string;
  dateTo?: string;
} {
  const today = toIsoDate(new Date());

  if (range === "thisWeek") {
    const weekStart = getMondayOfWeek(today);
    return { dateFrom: weekStart, dateTo: addDays(weekStart, 6) };
  }

  if (range === "lastWeek") {
    const weekStart = addDays(getMondayOfWeek(today), -7);
    return { dateFrom: weekStart, dateTo: addDays(weekStart, 6) };
  }

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toIsoDate(first), dateTo: toIsoDate(last) };
}

export function getDashboardRankingParams(range: DashboardDateRange): {
  weekStart?: string;
  dateFrom?: string;
  dateTo?: string;
} {
  if (range === "thisWeek") {
    const weekStart = getMondayOfWeek(toIsoDate(new Date()));
    return { weekStart };
  }

  if (range === "lastWeek") {
    return { weekStart: addDays(getMondayOfWeek(toIsoDate(new Date())), -7) };
  }

  return getDashboardKpiParams(range);
}

export function buildDashboardFilterParams(options: {
  dateRange: DashboardDateRange;
  weekFilter: string;
  dispatcherFilter: string;
}): {
  dateFrom?: string;
  dateTo?: string;
  weekStart?: string;
  dispatcherId?: string;
} {
  const params: {
    dateFrom?: string;
    dateTo?: string;
    weekStart?: string;
    dispatcherId?: string;
  } = {};

  if (options.dispatcherFilter !== "all") {
    params.dispatcherId = options.dispatcherFilter;
  }

  if (options.weekFilter !== "all") {
    params.weekStart = options.weekFilter;
    return params;
  }

  if (options.dateRange === "thisWeek" || options.dateRange === "lastWeek") {
    const ranking = getDashboardRankingParams(options.dateRange);
    params.weekStart = ranking.weekStart;
  } else {
    Object.assign(params, getDashboardKpiParams(options.dateRange));
  }

  return params;
}
