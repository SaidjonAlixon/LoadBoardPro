import { Router } from "express";
import { db, loadsTable, driversTable, usersTable, brokersTable } from "@workspace/db";
import { eq, and, sql, desc, inArray, gte, lte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

const ON_LOAD_STATUSES = ["Booked", "InQM", "NeedRevRC", "Issue", "PickedUp"] as const;

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

async function getDriversOnLoadTodayIds(dispatcherId?: string): Promise<Set<string>> {
  const today = todayIso();

  const onLoadConditions = [
    eq(loadsTable.isDeleted, false),
    inArray(loadsTable.status, [...ON_LOAD_STATUSES]),
    lte(loadsTable.puDate, today),
    gte(loadsTable.delDate, today),
  ];
  if (dispatcherId) {
    onLoadConditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  }

  const onLoadRows = await db
    .select({ driverId: loadsTable.driverId })
    .from(loadsTable)
    .where(and(...onLoadConditions));

  return new Set(
    onLoadRows.map((r) => r.driverId).filter((id): id is string => Boolean(id)),
  );
}

async function computeDriverStatusToday(dispatcherId?: string) {
  const activeDrivers = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.isActive, true));

  const driversOnLoadSet = await getDriversOnLoadTodayIds(dispatcherId);

  const totalDrivers = activeDrivers.length;
  const driversOnLoad = activeDrivers.filter((d) => driversOnLoadSet.has(d.id)).length;
  const driversEmpty = Math.max(0, totalDrivers - driversOnLoad);

  return { totalDrivers, driversOnLoad, driversEmpty, driversOnLoadSet };
}

// GET /api/weekly — list available week periods
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const weekConditions = [eq(loadsTable.isDeleted, false)];
  if (req.userRole === "dispatcher" && req.userId) {
    weekConditions.push(eq(loadsTable.dispatcherId, req.userId));
  }

  const weeks = await db
    .selectDistinct({ weekStart: loadsTable.weekStart })
    .from(loadsTable)
    .where(and(...weekConditions))
    .orderBy(desc(loadsTable.weekStart))
    .limit(52);

  const result = weeks.map(w => {
    const start = new Date(w.weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      weekStart: w.weekStart,
      weekEnd: end.toISOString().split("T")[0],
      loadCount: 0,
      totalGross: 0,
    };
  });

  // Enrich with counts
  const counts = await db
    .select({
      weekStart: loadsTable.weekStart,
      loadCount: sql<number>`count(*)::int`,
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
    })
    .from(loadsTable)
    .where(and(...weekConditions))
    .groupBy(loadsTable.weekStart);

  const countMap = Object.fromEntries(counts.map(c => [c.weekStart, c]));
  res.json(result.map(w => ({
    ...w,
    loadCount: Number(countMap[w.weekStart]?.loadCount ?? 0),
    totalGross: Number(countMap[w.weekStart]?.totalGross ?? 0),
  })));
});

// GET /api/weekly/:weekStart
router.get("/:weekStart", requireAuth, async (req: AuthRequest, res) => {
  const { weekStart } = req.params;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  const dispatcherFilter =
    req.userRole === "dispatcher" && req.userId ? req.userId : undefined;
  const { driversOnLoadSet, ...driverStatus } = await computeDriverStatusToday(dispatcherFilter);

  const loadConditions = [
    eq(loadsTable.weekStart, weekStart),
    eq(loadsTable.isDeleted, false),
  ];
  if (dispatcherFilter) {
    loadConditions.push(eq(loadsTable.dispatcherId, dispatcherFilter));
  }

  const loads = await db
    .select()
    .from(loadsTable)
    .where(and(...loadConditions))
    .orderBy(loadsTable.sortOrder, loadsTable.puDate);

  const activeDrivers = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.isActive, true))
    .orderBy(driversTable.fullName);

  const buildEmptyResponse = () => {
    const emptyBlocks = activeDrivers.map((driver) => ({
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        driverType: driver.driverType,
        phone: driver.phone,
        email: driver.email,
        truckNumber: driver.truckNumber,
        isActive: driver.isActive,
        createdAt: driver.createdAt,
      },
      loads: [] as never[],
      totalGross: 0,
      totalMiles: 0,
      totalReimbursement: 0,
    }));

    const driversOnLoadToday = emptyBlocks.filter((b) => driversOnLoadSet.has(b.driver.id));
    const driversEmptyToday = emptyBlocks.filter((b) => !driversOnLoadSet.has(b.driver.id));

    return {
      weekStart,
      weekEnd: weekEndStr,
      drivers: [],
      driversOnLoadToday,
      driversEmptyToday,
      driverStatus,
      kpi: {
        totalGross: 0,
        totalMileage: 0,
        avgRpm: 0,
        activeDrivers: 0,
        totalReimbursement: 0,
        ooCount: 0,
        cdCount: 0,
        grossPerDriver: 0,
      },
    };
  };

  if (!loads.length) {
    res.json(buildEmptyResponse());
    return;
  }

  const driverIds = [...new Set(loads.map(l => l.driverId).filter(Boolean))] as string[];
  const dispatcherIds = [...new Set(loads.map(l => l.dispatcherId).filter(Boolean))] as string[];
  const brokerIds = [...new Set(loads.map(l => l.brokerId).filter(Boolean))] as string[];

  const [drivers, dispatchers, brokers] = await Promise.all([
    driverIds.length ? db.select().from(driversTable).where(inArray(driversTable.id, driverIds)) : [],
    dispatcherIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, dispatcherIds)) : [],
    brokerIds.length ? db.select().from(brokersTable).where(inArray(brokersTable.id, brokerIds)) : [],
  ]);

  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const dispMap = Object.fromEntries(dispatchers.map(d => [d.id, d]));
  const brokerMap = Object.fromEntries(brokers.map(b => [b.id, b]));

  // Group by driver
  const byDriver: Record<string, typeof loads> = {};
  for (const load of loads) {
    const key = load.driverId ?? "unassigned";
    if (!byDriver[key]) byDriver[key] = [];
    byDriver[key].push(load);
  }

  const driverBlocks = Object.entries(byDriver).map(([driverId, dLoads]) => {
    const driver = driverId !== "unassigned" ? driverMap[driverId] : null;
    const totalGross = dLoads.reduce((sum, l) => sum + Number(l.rate) + Number(l.reimbursement), 0);
    const totalMiles = dLoads.reduce((sum, l) => sum + Number(l.mileage), 0);
    const totalReimb = dLoads.reduce((sum, l) => sum + Number(l.reimbursement), 0);

    return {
      driver: driver ? {
        id: driver.id, fullName: driver.fullName, driverType: driver.driverType,
        phone: driver.phone, email: driver.email, truckNumber: driver.truckNumber, isActive: driver.isActive, createdAt: driver.createdAt
      } : { id: "unassigned", fullName: "Unassigned", driverType: "OO", phone: null, email: null, truckNumber: null, isActive: true, createdAt: new Date() },
      loads: dLoads.map(l => ({
        id: l.id, loadNumber: l.loadNumber, puDate: l.puDate, delDate: l.delDate,
        originCity: l.originCity, originState: l.originState, destCity: l.destCity, destState: l.destState,
        mileage: Number(l.mileage), rate: Number(l.rate),
        rpm: Number(l.mileage) > 0 ? Number(l.rate) / Number(l.mileage) : null,
        status: l.status, reimbursement: Number(l.reimbursement),
        dispatchNotes: l.dispatchNotes, invoicedAmount: l.invoicedAmount !== null ? Number(l.invoicedAmount) : null,
        brokerPaid: l.brokerPaid !== null ? Number(l.brokerPaid) : null, notes: l.notes,
        weekStart: l.weekStart, driverId: l.driverId, dispatcherId: l.dispatcherId, brokerId: l.brokerId,
        broker: l.brokerId ? brokerMap[l.brokerId] : null,
        dispatcher: l.dispatcherId ? dispMap[l.dispatcherId] : null,
        irDiff: l.invoicedAmount !== null ? Number(l.invoicedAmount) - (Number(l.rate) + Number(l.reimbursement)) : null,
        biDiff: l.brokerPaid !== null && l.invoicedAmount !== null ? Number(l.brokerPaid) - Number(l.invoicedAmount) : null,
        createdAt: l.createdAt, updatedAt: l.updatedAt,
      })),
      totalGross,
      totalMiles,
      totalReimbursement: totalReimb,
    };
  });

  const blockByDriverId = new Map(
    driverBlocks
      .filter((b) => b.driver.id !== "unassigned")
      .map((b) => [b.driver.id, b]),
  );
  const unassignedBlock = driverBlocks.find((b) => b.driver.id === "unassigned");

  const allDriverBlocks = activeDrivers.map((driver) => {
    const existing = blockByDriverId.get(driver.id);
    if (existing) return existing;
    return {
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        driverType: driver.driverType,
        phone: driver.phone,
        email: driver.email,
        truckNumber: driver.truckNumber,
        isActive: driver.isActive,
        createdAt: driver.createdAt,
      },
      loads: [],
      totalGross: 0,
      totalMiles: 0,
      totalReimbursement: 0,
    };
  });

  const driversOnLoadToday = allDriverBlocks.filter((b) => driversOnLoadSet.has(b.driver.id));
  const driversEmptyToday = allDriverBlocks.filter((b) => !driversOnLoadSet.has(b.driver.id));
  if (unassignedBlock) {
    const unassignedOnLoad = unassignedBlock.loads.some(
      (l) =>
        ON_LOAD_STATUSES.includes(l.status as (typeof ON_LOAD_STATUSES)[number]) &&
        l.puDate <= todayIso() &&
        l.delDate >= todayIso(),
    );
    if (unassignedOnLoad) driversOnLoadToday.push(unassignedBlock);
    else driversEmptyToday.push(unassignedBlock);
  }

  const allGross = loads.reduce((sum, l) => sum + Number(l.rate) + Number(l.reimbursement), 0);
  const allMiles = loads.reduce((sum, l) => sum + Number(l.mileage), 0);
  const allReimb = loads.reduce((sum, l) => sum + Number(l.reimbursement), 0);
  const avgRpm = allMiles > 0 ? loads.reduce((sum, l) => sum + (Number(l.rate) / Number(l.mileage)), 0) / loads.length : 0;
  const activeDriverIds = new Set(loads.filter(l => l.driverId).map(l => l.driverId));
  const ooCount = drivers.filter(d => activeDriverIds.has(d.id) && d.driverType === "OO").length;
  const cdCount = drivers.filter(d => activeDriverIds.has(d.id) && d.driverType === "CD").length;

  res.json({
    weekStart,
    weekEnd: weekEndStr,
    drivers: driverBlocks,
    driversOnLoadToday,
    driversEmptyToday,
    driverStatus,
    kpi: {
      totalGross: allGross,
      totalMileage: allMiles,
      avgRpm,
      activeDrivers: activeDriverIds.size,
      totalReimbursement: allReimb,
      ooCount,
      cdCount,
      grossPerDriver: activeDriverIds.size > 0 ? allGross / activeDriverIds.size : 0,
    },
  });
});

export default router;
