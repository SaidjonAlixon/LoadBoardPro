import { db, loadsTable, driversTable, usersTable, brokersTable } from "@workspace/db";
import { eq, and, inArray, gte, lte, isNull, sql } from "drizzle-orm";

export const ON_LOAD_STATUSES = ["Booked", "InQM", "NeedRevRC", "Issue", "PickedUp"] as const;

export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export type DriversTodayScope = "company" | "mine";

async function getDispatcherDriverIds(dispatcherId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ driverId: loadsTable.driverId })
    .from(loadsTable)
    .where(and(
      eq(loadsTable.isDeleted, false),
      eq(loadsTable.dispatcherId, dispatcherId),
      sql`${loadsTable.driverId} is not null`,
    ));

  return new Set(
    rows.map((r) => r.driverId).filter((id): id is string => Boolean(id)),
  );
}

export async function getDriversTodayStatus(options?: {
  scope?: DriversTodayScope;
  dispatcherId?: string;
}) {
  const scope = options?.scope ?? (options?.dispatcherId ? "mine" : "company");
  const dispatcherId = scope === "mine" ? options?.dispatcherId : undefined;
  const today = todayIso();

  const activeDrivers = await db
    .select()
    .from(driversTable)
    .where(and(eq(driversTable.isActive, true), isNull(driversTable.deletedAt)))
    .orderBy(driversTable.fullName);

  let scopedDrivers = activeDrivers;
  if (scope === "mine" && dispatcherId) {
    const pool = await getDispatcherDriverIds(dispatcherId);
    scopedDrivers = activeDrivers.filter((d) => pool.has(d.id));
  }

  const onLoadConditions = [
    eq(loadsTable.isDeleted, false),
    inArray(loadsTable.status, [...ON_LOAD_STATUSES]),
    lte(loadsTable.puDate, today),
    gte(loadsTable.delDate, today),
  ];
  if (dispatcherId) {
    onLoadConditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  }

  const todayLoads = await db
    .select()
    .from(loadsTable)
    .where(and(...onLoadConditions))
    .orderBy(loadsTable.puDate);

  const dispatcherIds = [
    ...new Set(todayLoads.map((l) => l.dispatcherId).filter(Boolean)),
  ] as string[];
  const brokerIds = [...new Set(todayLoads.map((l) => l.brokerId).filter(Boolean))] as string[];

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

  const loadsByDriver = new Map<string, typeof todayLoads>();
  for (const load of todayLoads) {
    if (!load.driverId) continue;
    const list = loadsByDriver.get(load.driverId) ?? [];
    list.push(load);
    loadsByDriver.set(load.driverId, list);
  }

  const mapLoad = (load: (typeof todayLoads)[number]) => ({
    id: load.id,
    loadNumber: load.loadNumber,
    driverId: load.driverId,
    dispatcherId: load.dispatcherId,
    brokerId: load.brokerId,
    puDate: load.puDate,
    delDate: load.delDate,
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
  });

  const allDrivers = scopedDrivers.map((driver) => {
    const driverLoads = loadsByDriver.get(driver.id) ?? [];
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
        isActive: driver.isActive,
        createdAt: driver.createdAt,
      },
      loads: driverLoads.map(mapLoad),
      totalGross,
      totalMiles,
      totalReimbursement: driverLoads.reduce((sum, l) => sum + Number(l.reimbursement ?? 0), 0),
    };
  });

  const driversOnLoadToday = allDrivers.filter((b) => b.loads.length > 0);
  const driversEmptyToday = allDrivers.filter((b) => b.loads.length === 0);

  return {
    date: today,
    scope,
    totalDrivers: scopedDrivers.length,
    driversOnLoad: driversOnLoadToday.length,
    driversEmpty: driversEmptyToday.length,
    allDrivers,
    driversOnLoadToday,
    driversEmptyToday,
  };
}
