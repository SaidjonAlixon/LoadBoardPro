import type { Driver, Load } from "@workspace/api-client-react";
import { resolveDriverBoardStatus, DRIVER_BOARD_STATUSES, type DriverBoardStatus } from "@/lib/driver-board-status";

export type DriverTodayDriver = Driver & {
  currentLocation?: string | null;
  boardStatus?: DriverBoardStatus | string | null;
  boardNote?: string | null;
  prebook?: string | null;
  odometer?: number | null;
  eta?: string | null;
};

export type DriverTodayBlock = {
  driver: DriverTodayDriver;
  loads: Load[];
  totalGross: number;
  totalMiles: number;
  totalReimbursement?: number;
};

export type DriversTodayScope = "company" | "mine";

export type DispatcherDriverGroup = {
  dispatcherId: string | null;
  dispatcherName: string;
  drivers: DriverTodayBlock[];
};

export type DriversTodayResponse = {
  date: string;
  weekStart: string;
  weekEnd: string;
  scope?: DriversTodayScope;
  totalDrivers: number;
  driversOnLoad: number;
  driversEmpty: number;
  allDrivers: DriverTodayBlock[];
  driversOnLoadToday: DriverTodayBlock[];
  driversEmptyToday: DriverTodayBlock[];
  dispatcherGroups?: DispatcherDriverGroup[];
};

export async function fetchDriversToday(options?: {
  dispatcherId?: string;
  scope?: DriversTodayScope;
  weekStart?: string;
  weekStarts?: string;
}): Promise<DriversTodayResponse> {
  const params = new URLSearchParams();
  if (options?.dispatcherId) params.set("dispatcherId", options.dispatcherId);
  if (options?.scope) params.set("scope", options.scope);
  if (options?.weekStart) params.set("weekStart", options.weekStart);
  if (options?.weekStarts) params.set("weekStarts", options.weekStarts);
  const qs = params.toString();
  const res = await fetch(`/api/analytics/drivers-today${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load drivers today");
  return res.json();
}

export type DriverChipFilter = "all" | DriverBoardStatus;

export function countDriversByStatus(blocks: DriverTodayBlock[]): Record<DriverBoardStatus, number> {
  const counts = Object.fromEntries(
    DRIVER_BOARD_STATUSES.map((s) => [s, 0]),
  ) as Record<DriverBoardStatus, number>;
  for (const block of blocks) {
    const status = resolveDriverBoardStatus(block.driver.boardStatus);
    counts[status] += 1;
  }
  return counts;
}

export function emptyStatusCounts(): Record<DriverBoardStatus, number> {
  return Object.fromEntries(
    DRIVER_BOARD_STATUSES.map((s) => [s, 0]),
  ) as Record<DriverBoardStatus, number>;
}

export function driversForChipFilter(
  data: DriversTodayResponse,
  filter: DriverChipFilter,
): DriverTodayBlock[] {
  return filterDriverBlocks(data.allDrivers, filter);
}

export function filterDriverBlocks(
  blocks: DriverTodayBlock[],
  filter: DriverChipFilter,
): DriverTodayBlock[] {
  if (filter === "all") return blocks;
  return blocks.filter((b) => resolveDriverBoardStatus(b.driver.boardStatus) === filter);
}


export const STATUSBOARD_FILTER_ALL = "all";
export const STATUSBOARD_DISPATCHER_UNASSIGNED = "__unassigned__";

export function applyDriverNameFilter(
  blocks: DriverTodayBlock[],
  driverId: string | null,
): DriverTodayBlock[] {
  if (!driverId || driverId === STATUSBOARD_FILTER_ALL) return blocks;
  return blocks.filter((b) => b.driver.id === driverId);
}

export function applyDispatcherNameFilter(
  blocks: DriverTodayBlock[],
  dispatcherKey: string | null,
): DriverTodayBlock[] {
  if (!dispatcherKey || dispatcherKey === STATUSBOARD_FILTER_ALL) return blocks;
  const dispatcherId =
    dispatcherKey === STATUSBOARD_DISPATCHER_UNASSIGNED ? null : dispatcherKey;
  return blocks.filter((b) => {
    const loadDispatcherIds = b.loads
      .map((l) => l.dispatcherId)
      .filter((id): id is string => Boolean(id));
    if (dispatcherId === null) return loadDispatcherIds.length === 0;
    return loadDispatcherIds.includes(dispatcherId);
  });
}

export function filterStatusboardSections(
  drivers: DriverTodayBlock[],
  groups: DispatcherDriverGroup[] | undefined,
  groupByDispatcher: boolean,
  statusFilter: DriverChipFilter,
  driverFilterId: string | null,
  dispatcherFilterKey: string | null,
): DispatcherDriverGroup[] {
  const applyFilters = (blocks: DriverTodayBlock[]) =>
    applyDispatcherNameFilter(
      applyDriverNameFilter(filterDriverBlocks(blocks, statusFilter), driverFilterId),
      dispatcherFilterKey,
    );

  if (groupByDispatcher && groups?.length) {
    let scopedGroups = groups;
    if (dispatcherFilterKey && dispatcherFilterKey !== STATUSBOARD_FILTER_ALL) {
      const dispatcherId =
        dispatcherFilterKey === STATUSBOARD_DISPATCHER_UNASSIGNED
          ? null
          : dispatcherFilterKey;
      scopedGroups = groups.filter((g) => g.dispatcherId === dispatcherId);
    }
    return scopedGroups
      .map((g) => ({
        ...g,
        drivers: sortDriversTodayBlocks(applyFilters(g.drivers)),
      }))
      .filter((g) => g.drivers.length > 0);
  }

  return [
    {
      dispatcherId: null,
      dispatcherName: "",
      drivers: sortDriversTodayBlocks(applyFilters(drivers)),
    },
  ].filter((g) => g.drivers.length > 0);
}

export function buildDriverFilterOptions(blocks: DriverTodayBlock[]): { id: string; name: string }[] {
  return [...blocks]
    .map((b) => ({ id: b.driver.id, name: b.driver.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildDispatcherFilterOptions(
  groups?: DispatcherDriverGroup[],
  blocks?: DriverTodayBlock[],
): { id: string | null; name: string }[] {
  if (groups?.length) {
    return groups.map((g) => ({
      id: g.dispatcherId,
      name: g.dispatcherName,
    }));
  }
  const map = new Map<string | null, string>();
  for (const block of blocks ?? []) {
    for (const load of block.loads) {
      if (load.dispatcherId) {
        const name =
          load.dispatcher?.name ||
          load.dispatcher?.email ||
          load.dispatcher?.nickname ||
          "Dispatcher";
        map.set(load.dispatcherId, name);
      }
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Sort by board status order, then name. */
export function sortDriversTodayBlocks(blocks: DriverTodayBlock[]): DriverTodayBlock[] {
  const order = new Map(DRIVER_BOARD_STATUSES.map((s, i) => [s, i]));
  return [...blocks].sort((a, b) => {
    const ao = order.get(resolveDriverBoardStatus(a.driver.boardStatus)) ?? 99;
    const bo = order.get(resolveDriverBoardStatus(b.driver.boardStatus)) ?? 99;
    if (ao !== bo) return ao - bo;
    return a.driver.fullName.localeCompare(b.driver.fullName);
  });
}
