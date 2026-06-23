import { db, loadsTable, driversTable, usersTable, brokersTable } from "@workspace/db";
import { eq, and, inArray, isNull, sql, asc } from "drizzle-orm";
import { applyWeekPeriodFilters, parseWeekStartsParam } from "./period-filters";
import { getThisWeekStart, normalizeWeekStart, weekEndFromStart } from "./week-calendar";

export const ON_LOAD_STATUSES = ["Booked", "InQM", "NeedRevRC", "Issue", "PickedUp"] as const;

export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export type DriversTodayScope = "company" | "mine";

export type DispatcherDriverGroup = {
  dispatcherId: string | null;
  dispatcherName: string;
  drivers: ReturnType<typeof buildDriverBlock>[];
};

async function getDispatcherDriverIds(
  dispatcherId: string,
  weekStart?: string,
): Promise<Set<string>> {
  const conditions = [
    eq(loadsTable.isDeleted, false),
    eq(loadsTable.dispatcherId, dispatcherId),
    sql`${loadsTable.driverId} is not null`,
  ];
  applyWeekPeriodFilters(conditions, { weekStart });

  const rows = await db
    .selectDistinct({ driverId: loadsTable.driverId })
    .from(loadsTable)
    .where(and(...conditions));

  return new Set(
    rows.map((r) => r.driverId).filter((id): id is string => Boolean(id)),
  );
}

function buildDriverBlock(
  driver: typeof driversTable.$inferSelect,
  driverLoads: (typeof loadsTable.$inferSelect)[],
  mapLoad: (load: (typeof loadsTable.$inferSelect)) => ReturnType<typeof mapLoadInner>,
) {
  const totalGross = driverLoads.reduce(
    (sum, l) => sum + Number(l.rate) + Number(l.reimbursement ?? 0),
    0,
  );
  const totalMiles = driverLoads.reduce((sum, l) => sum + Number(l.mileage), 0);

  return {
    driver: {
      id: driver.id,
      fullName: driver.fullName,
      driverType: driver.driverType,
      phone: driver.phone,
      email: driver.email,
      truckNumber: driver.truckNumber,
      currentLocation: driver.currentLocation,
      boardStatus: driver.boardStatus ?? "Ready",
      boardNote: driver.boardNote,
      prebook: driver.prebook,
      odometer: driver.odometer,
      eta: driver.eta,
      isActive: driver.isActive,
      createdAt: driver.createdAt,
    },
    loads: driverLoads.map(mapLoad),
    totalGross,
    totalMiles,
    totalReimbursement: driverLoads.reduce((sum, l) => sum + Number(l.reimbursement ?? 0), 0),
  };
}

function mapLoadInner(
  load: typeof loadsTable.$inferSelect,
  dispMap: Record<string, typeof usersTable.$inferSelect>,
  brokerMap: Record<string, typeof brokersTable.$inferSelect>,
) {
  return {
    id: load.id,
    loadNumber: load.loadNumber,
    driverId: load.driverId,
    dispatcherId: load.dispatcherId,
    brokerId: load.brokerId,
    puDate: load.puDate,
    delDate: load.delDate,
    puScheduledAt: load.puScheduledAt?.toISOString() ?? null,
    delScheduledAt: load.delScheduledAt?.toISOString() ?? null,
    originCity: load.originCity,
    originState: load.originState,
    destCity: load.destCity,
    destState: load.destState,
    mileage: Number(load.mileage),
    rate: Number(load.rate),
    rpm: load.rpm != null ? Number(load.rpm) : null,
    status: load.status,
    reimbursement: Number(load.reimbursement ?? 0),
    dispatchNotes: load.dispatchNotes ?? null,
    invoicedAmount: load.invoicedAmount != null ? Number(load.invoicedAmount) : null,
    brokerPaid: load.brokerPaid != null ? Number(load.brokerPaid) : null,
    irDiff: load.irDiff != null ? Number(load.irDiff) : null,
    biDiff: load.biDiff != null ? Number(load.biDiff) : null,
    dispatcher: load.dispatcherId ? dispMap[load.dispatcherId] ?? null : null,
    broker: load.brokerId ? brokerMap[load.brokerId] ?? null : null,
  };
}

async function buildDispatcherGroups(
  allDrivers: ReturnType<typeof buildDriverBlock>[],
  weekStart: string,
): Promise<DispatcherDriverGroup[]> {
  const dispatchers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "dispatcher"))
    .orderBy(usersTable.name);

  const assigned = new Set<string>();
  const groups: DispatcherDriverGroup[] = [];

  for (const dispatcher of dispatchers) {
    const pool = await getDispatcherDriverIds(dispatcher.id, weekStart);
    const drivers = allDrivers.filter((b) => pool.has(b.driver.id));
    if (!drivers.length) continue;
    drivers.forEach((b) => assigned.add(b.driver.id));
    groups.push({
      dispatcherId: dispatcher.id,
      dispatcherName: dispatcher.name || dispatcher.email || dispatcher.nickname || "Dispatcher",
      drivers: drivers.sort((a, b) => a.driver.fullName.localeCompare(b.driver.fullName)),
    });
  }

  const unassigned = allDrivers.filter((b) => !assigned.has(b.driver.id));
  if (unassigned.length) {
    groups.push({
      dispatcherId: null,
      dispatcherName: "Unassigned",
      drivers: unassigned.sort((a, b) => a.driver.fullName.localeCompare(b.driver.fullName)),
    });
  }

  return groups;
}

export async function getDriversTodayStatus(options?: {
  scope?: DriversTodayScope;
  dispatcherId?: string;
  weekStart?: string;
  weekStarts?: string;
}) {
  const scope = options?.scope ?? (options?.dispatcherId ? "mine" : "company");
  const dispatcherId = scope === "mine" ? options?.dispatcherId : undefined;
  const parsedWeeks = parseWeekStartsParam(options?.weekStarts);
  const weekStart = options?.weekStart
    ? normalizeWeekStart(options.weekStart)
    : (parsedWeeks[0] ?? getThisWeekStart());
  const weekEnd = weekEndFromStart(weekStart);
  const today = todayIso();

  const activeDrivers = await db
    .select()
    .from(driversTable)
    .where(and(eq(driversTable.isActive, true), isNull(driversTable.deletedAt)))
    .orderBy(driversTable.fullName);

  let scopedDrivers = activeDrivers;
  if (scope === "mine" && dispatcherId) {
    const pool = await getDispatcherDriverIds(dispatcherId, weekStart);
    scopedDrivers = activeDrivers.filter((d) => pool.has(d.id));
  }

  const loadConditions = [eq(loadsTable.isDeleted, false)];
  applyWeekPeriodFilters(loadConditions, {
    weekStart,
    weekStarts: options?.weekStarts,
  });
  if (dispatcherId) {
    loadConditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  }

  const weekLoads = await db
    .select()
    .from(loadsTable)
    .where(and(...loadConditions))
    .orderBy(asc(loadsTable.sortOrder), asc(loadsTable.puDate));

  const dispatcherIds = [
    ...new Set(weekLoads.map((l) => l.dispatcherId).filter(Boolean)),
  ] as string[];
  const brokerIds = [...new Set(weekLoads.map((l) => l.brokerId).filter(Boolean))] as string[];

  const [dispatchers, brokers] = await Promise.all([
    dispatcherIds.length
      ? db.select().from(usersTable).where(inArray(usersTable.id, dispatcherIds))
      : [],
    brokerIds.length
      ? db.select().from(brokersTable).where(inArray(brokersTable.id, brokerIds))
      : [],
  ]);

  const dispMap = Object.fromEntries(dispatchers.map((d) => [d.id, d]));
  const brokerMap = Object.fromEntries(brokers.map((b) => [b.id, b]));

  const mapLoad = (load: (typeof weekLoads)[number]) =>
    mapLoadInner(load, dispMap, brokerMap);

  const loadsByDriver = new Map<string, typeof weekLoads>();
  for (const load of weekLoads) {
    if (!load.driverId) continue;
    const list = loadsByDriver.get(load.driverId) ?? [];
    list.push(load);
    loadsByDriver.set(load.driverId, list);
  }

  const allDrivers = scopedDrivers.map((driver) =>
    buildDriverBlock(driver, loadsByDriver.get(driver.id) ?? [], mapLoad),
  );

  const driversCoveredToday = allDrivers.filter(
    (b) => (b.driver.boardStatus ?? "Ready") === "Covered",
  );
  const driversReadyToday = allDrivers.filter(
    (b) => (b.driver.boardStatus ?? "Ready") === "Ready",
  );

  const dispatcherGroups =
    scope === "company" ? await buildDispatcherGroups(allDrivers, weekStart) : undefined;

  return {
    date: today,
    weekStart,
    weekEnd,
    scope,
    totalDrivers: scopedDrivers.length,
    driversOnLoad: driversCoveredToday.length,
    driversEmpty: driversReadyToday.length,
    allDrivers,
    driversOnLoadToday: driversCoveredToday,
    driversEmptyToday: driversReadyToday,
    dispatcherGroups,
  };
}
