import type { Load, DispatcherRank } from "@workspace/api-client-react";
import { normalizeWeekStart, parseDateOnly } from "@/lib/date-range";
import { isLoadDraftInProgress } from "@/lib/validate-dispatcher-load";

const ON_LOAD_STATUSES = new Set(["Booked", "InQM", "NeedRevRC", "Issue", "PickedUp"]);

export type SpreadsheetKpi = {
  totalGross: number;
  totalMiles: number;
  avgRpm: number;
  grossPerDriver: number;
  totalLoads: number;
  totalReimb: number;
  totalInvoiced: number;
  totalPaid: number;
  totalIr: number;
  totalBi: number;
  totalDrivers: number;
  driversOnLoad: number;
  driversEmpty: number;
};

function sumField(loads: Load[], field: keyof Load): number {
  return loads.reduce((acc, l) => acc + (Number(l[field]) || 0), 0);
}

export function loadsInWeekRange(loads: Load[], weekStarts: string | string[]): Load[] {
  const weeks = new Set(
    (Array.isArray(weekStarts) ? weekStarts : weekStarts.split(","))
      .map((w) => normalizeWeekStart(w.trim()))
      .filter(Boolean),
  );
  if (weeks.size === 0) return loads;
  return loads.filter((l) => weeks.has(normalizeWeekStart(l.weekStart || l.puDate || "")));
}

export function filterLoadsForSpreadsheetKpi(
  loads: Load[],
  options?: {
    weekStarts?: string | string[];
    filterDriverId?: string;
    dispatcherFilterId?: string;
    filterStatus?: string;
    hiddenDriverIds?: Set<string>;
    searchActive?: boolean;
  },
): Load[] {
  let list = loads;
  if (options?.weekStarts) {
    list = loadsInWeekRange(list, options.weekStarts);
  }
  if (options?.filterDriverId) {
    list = list.filter((l) => l.driverId === options.filterDriverId);
  }
  if (options?.dispatcherFilterId) {
    list = list.filter((l) => l.dispatcherId === options.dispatcherFilterId);
  }
  if (options?.filterStatus) {
    list = list.filter((l) => l.status === options.filterStatus);
  }
  if (!options?.searchActive && options?.hiddenDriverIds?.size) {
    list = list.filter((l) => !l.driverId || !options.hiddenDriverIds!.has(l.driverId));
  }
  return list.filter((l) => !isLoadDraftInProgress(l));
}

export function computeSpreadsheetKpi(loads: Load[]): SpreadsheetKpi {
  const totalRate = sumField(loads, "rate");
  const totalReimb = sumField(loads, "reimbursement");
  const totalGross = totalRate;
  const totalMiles = sumField(loads, "mileage");
  const avgRpm = totalMiles > 0 ? totalRate / totalMiles : 0;
  const driverIds = new Set(
    loads.map((l) => l.driverId).filter((id): id is string => Boolean(id)),
  );
  const driversOnLoadIds = new Set(
    loads
      .filter((l) => l.driverId && ON_LOAD_STATUSES.has(String(l.status)))
      .map((l) => l.driverId as string),
  );
  const grossPerDriver = driverIds.size > 0 ? totalGross / driverIds.size : 0;
  const totalInvoiced = loads.reduce((a, l) => a + (l.invoicedAmount ?? 0), 0);
  const totalPaid = loads.reduce((a, l) => a + (l.brokerPaid ?? 0), 0);
  const totalIr = totalInvoiced - (totalRate + totalReimb);
  const totalBi = totalPaid - totalInvoiced;
  return {
    totalGross,
    totalMiles,
    avgRpm,
    grossPerDriver,
    totalLoads: loads.length,
    totalReimb,
    totalInvoiced,
    totalPaid,
    totalIr,
    totalBi,
    totalDrivers: driverIds.size,
    driversOnLoad: driversOnLoadIds.size,
    driversEmpty: Math.max(0, driverIds.size - driversOnLoadIds.size),
  };
}

type DispatcherLike = { id: string; name?: string | null; email?: string | null };

export function computeDispatcherRanking(
  loads: Load[],
  dispatchers: DispatcherLike[],
): DispatcherRank[] {
  const byDispatcher = new Map<string, { gross: number; miles: number; loads: number }>();

  for (const load of loads) {
    if (!load.dispatcherId) continue;
    const cur = byDispatcher.get(load.dispatcherId) ?? { gross: 0, miles: 0, loads: 0 };
    cur.gross += Number(load.rate) || 0;
    cur.miles += Number(load.mileage) || 0;
    cur.loads += 1;
    byDispatcher.set(load.dispatcherId, cur);
  }

  return dispatchers
    .map((d) => {
      const stats = byDispatcher.get(d.id);
      const gross = stats?.gross ?? 0;
      const miles = stats?.miles ?? 0;
      const avgRpm = miles > 0 ? gross / miles : 0;
      const kpiScore = Math.round(((gross * avgRpm) / 1000) * 10) / 10;
      return {
        dispatcherId: d.id,
        dispatcherName: d.name ?? d.email ?? "Unknown",
        gross,
        miles,
        loads: stats?.loads ?? 0,
        avgRpm,
        kpiScore,
      };
    })
    .sort((a, b) => b.kpiScore - a.kpiScore || b.gross - a.gross);
}

function dayOffsetInWeek(weekMonday: string, isoDate: string): number | null {
  const mon = parseDateOnly(normalizeWeekStart(weekMonday));
  const d = parseDateOnly(isoDate.slice(0, 10));
  const diff = Math.round((d.getTime() - mon.getTime()) / 86_400_000);
  if (diff < 0 || diff > 6) return null;
  return diff;
}

/** Mon–Sun load counts (PU date) for one dispatcher across selected weeks. */
export function computeDispatcherDailyActivity(
  loads: Load[],
  dispatcherId: string,
  weekStarts: string[],
): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const weeks = weekStarts.map(normalizeWeekStart).filter(Boolean);
  if (weeks.length === 0) return buckets;

  for (const load of loads) {
    if (load.dispatcherId !== dispatcherId) continue;
    const date = (load.puDate || load.delDate || "").slice(0, 10);
    if (!date) continue;
    const weekMon = weeks.find((w) => dayOffsetInWeek(w, date) !== null);
    if (!weekMon) continue;
    const idx = dayOffsetInWeek(weekMon, date);
    if (idx !== null) buckets[idx]++;
  }

  return buckets;
}

export type TopDriverRow = {
  driverId: string;
  name: string;
  loads: number;
  gross: number;
};

export function computeTopDriversByGross(
  loads: Load[],
  drivers: { id: string; fullName: string }[],
  limit = 5,
): TopDriverRow[] {
  const byDriver = new Map<string, { loads: number; gross: number }>();
  const nameById = new Map(drivers.map((d) => [d.id, d.fullName]));

  for (const load of loads) {
    if (!load.driverId) continue;
    const cur = byDriver.get(load.driverId) ?? { loads: 0, gross: 0 };
    cur.loads += 1;
    cur.gross += Number(load.rate) || 0;
    byDriver.set(load.driverId, cur);
    if (load.driver?.fullName) nameById.set(load.driverId, load.driver.fullName);
  }

  return [...byDriver.entries()]
    .map(([driverId, stats]) => ({
      driverId,
      name: nameById.get(driverId) ?? "—",
      loads: stats.loads,
      gross: stats.gross,
    }))
    .sort((a, b) => b.gross - a.gross || b.loads - a.loads)
    .slice(0, limit);
}
