import type { Driver, Load } from "@workspace/api-client-react";

export type DriverTodayBlock = {
  driver: Driver & { currentLocation?: string | null };
  loads: Load[];
  totalGross: number;
  totalMiles: number;
  totalReimbursement?: number;
};

export type DriversTodayScope = "company" | "mine";

export type DriversTodayResponse = {
  date: string;
  scope?: DriversTodayScope;
  totalDrivers: number;
  driversOnLoad: number;
  driversEmpty: number;
  allDrivers: DriverTodayBlock[];
  driversOnLoadToday: DriverTodayBlock[];
  driversEmptyToday: DriverTodayBlock[];
};

export async function fetchDriversToday(options?: {
  dispatcherId?: string;
  scope?: DriversTodayScope;
}): Promise<DriversTodayResponse> {
  const params = new URLSearchParams();
  if (options?.dispatcherId) params.set("dispatcherId", options.dispatcherId);
  if (options?.scope) params.set("scope", options.scope);
  const qs = params.toString();
  const res = await fetch(`/api/analytics/drivers-today${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load drivers today");
  return res.json();
}

export type DriverChipFilter = "all" | "covered" | "ready";

export function driversForChipFilter(
  data: DriversTodayResponse,
  filter: DriverChipFilter,
): DriverTodayBlock[] {
  let list: DriverTodayBlock[];
  if (filter === "covered") list = data.driversOnLoadToday;
  else if (filter === "ready") list = data.driversEmptyToday;
  else list = data.allDrivers;
  return sortDriversTodayBlocks(list);
}

/** Ready (no load) first, covered (on load) last; alphabetical within each group. */
export function sortDriversTodayBlocks(blocks: DriverTodayBlock[]): DriverTodayBlock[] {
  return [...blocks].sort((a, b) => {
    const aReady = a.loads.length === 0 ? 0 : 1;
    const bReady = b.loads.length === 0 ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    return a.driver.fullName.localeCompare(b.driver.fullName);
  });
}
