import type { StatusBoardLoadOverride } from "@workspace/db";

type LoadLike = {
  id: string;
  loadNumber: string;
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  puDate: string;
  delDate: string;
  puScheduledAt?: Date | string | null;
  delScheduledAt?: Date | string | null;
  dispatchNotes?: string | null;
};

export function applyStatusBoardLoadOverride<T extends LoadLike>(
  load: T,
  override: StatusBoardLoadOverride | undefined,
): T | null {
  if (override?.hiddenFromBoard) return null;
  if (!override) return load;

  return {
    ...load,
    loadNumber: override.loadNumber ?? load.loadNumber,
    originCity: override.originCity ?? load.originCity,
    originState: override.originState ?? load.originState,
    destCity: override.destCity ?? load.destCity,
    destState: override.destState ?? load.destState,
    puDate: override.puDate ?? load.puDate,
    delDate: override.delDate ?? load.delDate,
    puScheduledAt: override.puScheduledAt ?? load.puScheduledAt,
    delScheduledAt: override.delScheduledAt ?? load.delScheduledAt,
    dispatchNotes: override.dispatchNotes ?? load.dispatchNotes,
  };
}

/** Status board list — always show Loads spreadsheet row; overlay fields when not hidden. */
export function mergeStatusBoardLoadForDisplay<T extends LoadLike>(
  load: T,
  override: StatusBoardLoadOverride | undefined,
): T {
  if (!override || override.hiddenFromBoard) return load;
  return applyStatusBoardLoadOverride(load, override) ?? load;
}

export const STATUS_BOARD_OVERRIDE_FIELDS = [
  "loadNumber",
  "originCity",
  "originState",
  "destCity",
  "destState",
  "puDate",
  "delDate",
  "puScheduledAt",
  "delScheduledAt",
  "dispatchNotes",
] as const;

export type StatusBoardOverridePatch = Partial<
  Record<(typeof STATUS_BOARD_OVERRIDE_FIELDS)[number], string | null>
>;
