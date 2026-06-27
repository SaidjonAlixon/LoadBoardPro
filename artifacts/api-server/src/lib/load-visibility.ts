import { sql, type SQL } from "drizzle-orm";
import { loadsTable } from "@workspace/db";
import { isLoadDraftInProgress } from "./validate-load";

type LoadLike = {
  loadNumber: string;
  puDate?: string | null;
  delDate?: string | null;
  originCity?: string | null;
  destCity?: string | null;
  mileage?: string | number | null;
  rate?: string | number | null;
  dispatcherId?: string | null;
  createdById?: string | null;
  statusBoardOnly?: boolean;
};

function draftSqlExpr() {
  return sql`(
    ${loadsTable.loadNumber} LIKE 'NEW-%'
    OR TRIM(COALESCE(${loadsTable.originCity}, '')) IN ('', '-')
    OR TRIM(COALESCE(${loadsTable.destCity}, '')) IN ('', '-')
    OR COALESCE(${loadsTable.mileage}::numeric, 0) <= 0
    OR COALESCE(${loadsTable.rate}::numeric, 0) <= 0
    OR ${loadsTable.puDate} IS NULL
    OR TRIM(COALESCE(${loadsTable.puDate}::text, '')) = ''
    OR ${loadsTable.delDate} IS NULL
    OR TRIM(COALESCE(${loadsTable.delDate}::text, '')) = ''
  )`;
}

function draftOwnerMatches(viewerId: string) {
  return sql`(
    ${loadsTable.createdById} = ${viewerId}
    OR (${loadsTable.createdById} IS NULL AND ${loadsTable.dispatcherId} = ${viewerId})
  )`;
}

/** Incomplete spreadsheet drafts — only visible to the user who created the row. */
export function loadsSpreadsheetVisibilityFilter(
  viewerId?: string | null,
  _viewerRole?: string | null,
): SQL {
  const draftExpr = draftSqlExpr();
  if (!viewerId) {
    return sql`NOT ${draftExpr}`;
  }
  return sql`(NOT ${draftExpr} OR ${draftOwnerMatches(viewerId)})`;
}

/** KPI / totals — never count in-progress drafts. */
export function loadsSpreadsheetCompleteOnlyFilter(): SQL {
  return sql`NOT ${draftSqlExpr()}`;
}

export function isLoadVisibleToViewer(
  load: LoadLike,
  viewerId?: string | null,
  _viewerRole?: string | null,
  options?: { includeStatusBoard?: boolean },
): boolean {
  if (load.statusBoardOnly && !options?.includeStatusBoard) return false;
  if (!isLoadDraftInProgress(load)) return true;
  if (!viewerId) return false;
  const ownerId = load.createdById ?? load.dispatcherId ?? null;
  return ownerId === viewerId;
}

export function filterDbLoadsForViewer<T extends LoadLike>(
  loads: T[],
  viewerId?: string | null,
  viewerRole?: string | null,
): T[] {
  return loads.filter((load) => isLoadVisibleToViewer(load, viewerId, viewerRole));
}
