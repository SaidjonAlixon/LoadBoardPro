import { eq } from "drizzle-orm";
import type { Response } from "express";
import { loadsTable } from "@workspace/db";

/** Request header — which UI board is editing the load. */
export const LOAD_BOARD_SCOPE_HEADER = "x-load-board-scope";

/** Loads created on the dashboard status board — hidden from the Loads spreadsheet. */
export function isLoadsSpreadsheetLoad(): ReturnType<typeof eq> {
  return eq(loadsTable.statusBoardOnly, false);
}

/** Loads created on the status board only — hidden from the Loads spreadsheet. */
export function isStatusBoardLoad(): ReturnType<typeof eq> {
  return eq(loadsTable.statusBoardOnly, true);
}

export function enforceLoadBoardPatchScope(
  load: { statusBoardOnly: boolean },
  scopeHeader: string | undefined,
  res: Response,
): boolean {
  if (!scopeHeader) return true;
  const scope = scopeHeader.toLowerCase();
  if (load.statusBoardOnly && scope === "spreadsheet") {
    res.status(403).json({ error: "This load belongs to the status board, not Loads" });
    return false;
  }
  if (!load.statusBoardOnly && scope === "statusboard") {
    res.status(403).json({ error: "This load belongs to Loads, not the status board" });
    return false;
  }
  return true;
}
