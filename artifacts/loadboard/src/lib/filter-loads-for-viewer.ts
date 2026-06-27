import type { Load } from "@workspace/api-client-react";
import { isLoadDraftInProgress } from "./validate-dispatcher-load";

type LoadWithMeta = Load & {
  statusBoardOnly?: boolean;
  createdById?: string | null;
};

/** Hide in-progress drafts from everyone except the user who started the row. */
export function isLoadVisibleToViewer(
  load: LoadWithMeta,
  viewerId?: string | null,
): boolean {
  if (load.statusBoardOnly) return false;
  if (!isLoadDraftInProgress(load)) return true;
  if (!viewerId) return false;
  const ownerId = load.createdById ?? load.dispatcherId ?? null;
  return ownerId === viewerId;
}

export function filterLoadsForViewer(
  loads: Load[],
  viewerId?: string | null,
): Load[] {
  return loads.filter((load) => isLoadVisibleToViewer(load as LoadWithMeta, viewerId));
}
