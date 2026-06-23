import { loadsTable } from "@workspace/db";
import { and, gte, lte, eq, inArray, type SQL } from "drizzle-orm";
import { normalizeWeekStart } from "./week-calendar";

export function parseWeekStartsParam(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((s) => normalizeWeekStart(s.trim())).filter(Boolean))];
}

/** Filter loads by one week, multiple weeks (OR), or a date range. */
export function applyWeekPeriodFilters(
  conditions: SQL[],
  query: {
    dateFrom?: string;
    dateTo?: string;
    weekStart?: string;
    weekStarts?: string;
  },
) {
  const weeks = parseWeekStartsParam(query.weekStarts);

  if (weeks.length > 0) {
    const normalized = weeks.map((w) => normalizeWeekStart(w));
    conditions.push(
      normalized.length === 1
        ? eq(loadsTable.weekStart, normalized[0]!)
        : inArray(loadsTable.weekStart, normalized),
    );
    return;
  }

  if (query.weekStart) {
    conditions.push(eq(loadsTable.weekStart, normalizeWeekStart(query.weekStart)));
    return;
  }

  if (query.dateFrom) conditions.push(gte(loadsTable.puDate, query.dateFrom));
  if (query.dateTo) conditions.push(lte(loadsTable.puDate, query.dateTo));
}
