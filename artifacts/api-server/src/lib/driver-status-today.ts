import { db, loadsTable, driversTable, usersTable, brokersTable, statusBoardLoadOverridesTable } from "@workspace/db";
import { eq, and, inArray, isNull, sql, asc } from "drizzle-orm";
import { applyWeekPeriodFilters, parseWeekStartsParam } from "./period-filters";
import { getThisWeekStart, normalizeWeekStart, todayIsoLocal, weekEndFromStart } from "./week-calendar";
import { isLoadVisibleToViewer } from "./load-visibility";
import { applyStatusBoardLoadOverride, mergeStatusBoardLoadForDisplay } from "./status-board-load-overrides";

export const ON_LOAD_STATUSES = ["Booked", "InQM", "NeedRevRC", "Issue", "PickedUp"] as const;

export function todayIso(): string {
  return todayIsoLocal();
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
  const totalGross = driverLoads.reduce((sum, l) => sum + Number(l.rate), 0);
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
    statusBoardOnly: load.statusBoardOnly,
    sortOrder: load.sortOrder,
    createdAt: load.createdAt?.toISOString?.() ?? load.createdAt ?? null,
  };
}

function sumBlockTotals(loads: ReturnType<typeof mapLoadInner>[]) {
  return {
    totalGross: loads.reduce((sum, l) => sum + l.rate, 0),
    totalMiles: loads.reduce((sum, l) => sum + l.mileage, 0),
    totalReimbursement: loads.reduce((sum, l) => sum + (l.reimbursement ?? 0), 0),
  };
}

function blockLoadsForDispatcher(
  block: ReturnType<typeof buildDriverBlock>,
  dispatcherId: string | null,
) {
  const filtered =
    dispatcherId === null
      ? block.loads.filter((l) => !l.dispatcherId)
      : block.loads.filter((l) => l.dispatcherId === dispatcherId);
  const totals = sumBlockTotals(filtered);
  return {
    ...block,
    loads: filtered,
    ...totals,
  };
}

/** Loads spreadsheet rows used to decide which dispatcher owns the driver on the status board. */
function loadsForDispatcherAssignmentFromRaw(
  rawLoads: (typeof loadsTable.$inferSelect)[],
): (typeof loadsTable.$inferSelect)[] {
  const spreadsheet = rawLoads.filter((l) => !l.statusBoardOnly);
  return spreadsheet.length > 0 ? spreadsheet : rawLoads;
}

/** One driver → one dispatcher (from Loads DISPATCHERS column; majority, then latest PU). */
function resolvePrimaryDispatcherByDriver(
  allDrivers: ReturnType<typeof buildDriverBlock>[],
  assignmentLoadsByDriver: Map<string, (typeof loadsTable.$inferSelect)[]>,
): Map<string, string | null> {
  const map = new Map<string, string | null>();

  for (const block of allDrivers) {
    const pool = loadsForDispatcherAssignmentFromRaw(
      assignmentLoadsByDriver.get(block.driver.id) ?? [],
    );
    if (!pool.length) {
      map.set(block.driver.id, null);
      continue;
    }

    const assigned = pool.filter((l) => l.dispatcherId);
    if (!assigned.length) {
      map.set(block.driver.id, null);
      continue;
    }

    const counts = new Map<string, number>();
    const latestPu = new Map<string, string>();

    for (const load of assigned) {
      const key = load.dispatcherId!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const pu = load.puDate ?? "";
      if (pu >= (latestPu.get(key) ?? "")) latestPu.set(key, pu);
    }

    let bestId: string | null = null;
    let bestCount = -1;
    let bestPu = "";

    for (const [key, count] of counts) {
      const pu = latestPu.get(key) ?? "";
      if (count > bestCount || (count === bestCount && pu > bestPu)) {
        bestCount = count;
        bestId = key;
        bestPu = pu;
      }
    }

    map.set(block.driver.id, bestId);
  }

  return map;
}

function sortDriversInDispatcherGroup(
  a: ReturnType<typeof buildDriverBlock>,
  b: ReturnType<typeof buildDriverBlock>,
): number {
  return a.driver.fullName.localeCompare(b.driver.fullName);
}

function sortUnassignedDrivers(
  a: ReturnType<typeof buildDriverBlock>,
  b: ReturnType<typeof buildDriverBlock>,
): number {
  const aEmpty = a.loads.length === 0;
  const bEmpty = b.loads.length === 0;
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
  if (!aEmpty && !bEmpty) {
    return a.driver.fullName.localeCompare(b.driver.fullName);
  }
  const aCreated = a.driver.createdAt ? new Date(a.driver.createdAt).getTime() : 0;
  const bCreated = b.driver.createdAt ? new Date(b.driver.createdAt).getTime() : 0;
  if (aCreated !== bCreated) return aCreated - bCreated;
  return a.driver.fullName.localeCompare(b.driver.fullName);
}

function blockForPrimarySection(
  block: ReturnType<typeof buildDriverBlock>,
  primaryDispatcherId: string | null,
) {
  if (primaryDispatcherId === null) {
    return blockLoadsForDispatcher(block, null);
  }
  const totals = sumBlockTotals(block.loads);
  return {
    ...block,
    loads: block.loads,
    ...totals,
  };
}

async function buildDispatcherGroups(
  allDrivers: ReturnType<typeof buildDriverBlock>[],
  assignmentLoadsByDriver: Map<string, (typeof loadsTable.$inferSelect)[]>,
  _weekStart: string,
): Promise<DispatcherDriverGroup[]> {
  const dispatchers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "dispatcher"))
    .orderBy(usersTable.name);

  const primaryByDriver = resolvePrimaryDispatcherByDriver(
    allDrivers,
    assignmentLoadsByDriver,
  );
  const groups: DispatcherDriverGroup[] = [];

  for (const dispatcher of dispatchers) {
    const drivers = allDrivers
      .filter((b) => primaryByDriver.get(b.driver.id) === dispatcher.id)
      .map((b) => blockForPrimarySection(b, dispatcher.id))
      .sort(sortDriversInDispatcherGroup);
    groups.push({
      dispatcherId: dispatcher.id,
      dispatcherName: dispatcher.name || dispatcher.email || dispatcher.nickname || "Dispatcher",
      drivers,
    });
  }

  const unassigned = allDrivers
    .filter((b) => primaryByDriver.get(b.driver.id) === null)
    .map((b) => blockForPrimarySection(b, null))
    .sort(sortUnassignedDrivers);

  groups.push({
    dispatcherId: null,
    dispatcherName: "Unassigned",
    drivers: unassigned,
  });

  return groups;
}

export async function getDriversTodayStatus(options?: {
  scope?: DriversTodayScope;
  dispatcherId?: string;
  weekStart?: string;
  weekStarts?: string;
  viewerUserId?: string | null;
  viewerRole?: string | null;
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

  const activeDriverIds = new Set(activeDrivers.map((d) => d.id));
  const weekDriverIds = [
    ...new Set(
      weekLoads.map((l) => l.driverId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const missingWeekDriverIds = weekDriverIds.filter((id) => !activeDriverIds.has(id));

  let scopedDrivers = activeDrivers;
  if (missingWeekDriverIds.length > 0) {
    const driversWithWeekLoads = await db
      .select()
      .from(driversTable)
      .where(inArray(driversTable.id, missingWeekDriverIds));
    scopedDrivers = [...activeDrivers, ...driversWithWeekLoads].sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );
  }

  if (scope === "mine" && dispatcherId) {
    const pool = await getDispatcherDriverIds(dispatcherId, weekStart);
    scopedDrivers = scopedDrivers.filter((d) => pool.has(d.id));
  }

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

  const overrideRows =
    weekLoads.length > 0
      ? await db
          .select()
          .from(statusBoardLoadOverridesTable)
          .where(
            inArray(
              statusBoardLoadOverridesTable.loadId,
              weekLoads.map((l) => l.id),
            ),
          )
      : [];
  const overrideMap = Object.fromEntries(overrideRows.map((o) => [o.loadId, o]));

  const mapLoad = (load: (typeof weekLoads)[number]) =>
    mapLoadInner(load, dispMap, brokerMap);

  const assignmentLoadsByDriver = new Map<string, typeof weekLoads>();
  const loadsByDriver = new Map<string, typeof weekLoads>();
  for (const load of weekLoads) {
    if (!load.driverId) continue;
    if (
      !isLoadVisibleToViewer(load, options?.viewerUserId, options?.viewerRole, {
        includeStatusBoard: true,
      })
    ) {
      continue;
    }

    const assignList = assignmentLoadsByDriver.get(load.driverId) ?? [];
    assignList.push(load);
    assignmentLoadsByDriver.set(load.driverId, assignList);

    const merged = mergeStatusBoardLoadForDisplay(load, overrideMap[load.id]);
    const list = loadsByDriver.get(load.driverId) ?? [];
    list.push(merged);
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
    scope === "company"
      ? await buildDispatcherGroups(allDrivers, assignmentLoadsByDriver, weekStart)
      : undefined;

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
