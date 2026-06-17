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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
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
