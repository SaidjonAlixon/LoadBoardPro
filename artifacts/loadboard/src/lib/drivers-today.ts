import type { Driver, Load } from "@workspace/api-client-react";

export type DriverTodayBlock = {
  driver: Driver;
  loads: Load[];
  totalGross: number;
  totalMiles: number;
  totalReimbursement?: number;
};

export type DriversTodayResponse = {
  date: string;
  totalDrivers: number;
  driversOnLoad: number;
  driversEmpty: number;
  allDrivers: DriverTodayBlock[];
  driversOnLoadToday: DriverTodayBlock[];
  driversEmptyToday: DriverTodayBlock[];
};

export async function fetchDriversToday(dispatcherId?: string): Promise<DriversTodayResponse> {
  const params = new URLSearchParams();
  if (dispatcherId) params.set("dispatcherId", dispatcherId);
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
  if (filter === "covered") return data.driversOnLoadToday;
  if (filter === "ready") return data.driversEmptyToday;
  return data.allDrivers;
}
