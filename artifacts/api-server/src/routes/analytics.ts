import { Router } from "express";
import { db, driversTable, loadsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, ne, inArray, type SQL } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { getDriversTodayStatus, ON_LOAD_STATUSES } from "../lib/driver-status-today";

const router = Router();

function applyPeriodFilters(
  conditions: SQL[],
  query: Record<string, string | undefined>,
) {
  const { dateFrom, dateTo, weekStart } = query;
  if (weekStart) {
    conditions.push(eq(loadsTable.weekStart, weekStart));
  } else {
    if (dateFrom) conditions.push(gte(loadsTable.puDate, dateFrom));
    if (dateTo) conditions.push(lte(loadsTable.puDate, dateTo));
  }
}

// GET /api/analytics/kpi
router.get("/kpi", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, driverId, weekStart } = req.query as Record<string, string>;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;
  const scopedDispatcherId = isDispatcher ? req.userId! : dispatcherId;

  const conditions = [eq(loadsTable.isDeleted, false)];
  applyPeriodFilters(conditions, { dateFrom, dateTo, weekStart });
  if (scopedDispatcherId) conditions.push(eq(loadsTable.dispatcherId, scopedDispatcherId));
  if (driverId) conditions.push(eq(loadsTable.driverId, driverId));
  const where = and(...conditions);

  const [result] = await db
    .select({
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
      totalMiles: sql<number>`coalesce(sum(${loadsTable.mileage}::numeric), 0)`,
      avgRpm: sql<number>`coalesce(avg(${loadsTable.rate}::numeric / nullif(${loadsTable.mileage}::numeric, 0)), 0)`,
      activeLoads: sql<number>`count(case when ${loadsTable.status} in ('Booked', 'InQM', 'NeedRevRC', 'Issue', 'PickedUp') then 1 end)::int`,
      brokerPaidTotal: sql<number>`coalesce(sum(${loadsTable.brokerPaid}::numeric), 0)`,
      unpaidDiff: sql<number>`coalesce(sum(case when ${loadsTable.brokerPaid}::numeric < ${loadsTable.invoicedAmount}::numeric then ${loadsTable.invoicedAmount}::numeric - ${loadsTable.brokerPaid}::numeric else 0 end), 0)`,
      totalLoads: sql<number>`count(*)::int`,
      deliveredLoads: sql<number>`count(case when ${loadsTable.status} in ('Delivered', 'Completed') then 1 end)::int`,
    })
    .from(loadsTable)
    .where(where);

  const totalGross = Number(result?.totalGross ?? 0);

  let driverIdPool: Set<string>;
  if (isDispatcher || scopedDispatcherId) {
    const poolConditions = [
      eq(loadsTable.isDeleted, false),
      eq(loadsTable.dispatcherId, scopedDispatcherId!),
      sql`${loadsTable.driverId} is not null`,
    ];
    applyPeriodFilters(poolConditions, { dateFrom, dateTo, weekStart });

    const poolRows = await db
      .selectDistinct({ driverId: loadsTable.driverId })
      .from(loadsTable)
      .where(and(...poolConditions));

    driverIdPool = new Set(
      poolRows.map((r) => r.driverId).filter((id): id is string => Boolean(id)),
    );
  } else {
    const activeDrivers = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(eq(driversTable.isActive, true));
    driverIdPool = new Set(activeDrivers.map((d) => d.id));
  }

  const onLoadConditions = [
    eq(loadsTable.isDeleted, false),
    inArray(loadsTable.status, [...ON_LOAD_STATUSES]),
    sql`${loadsTable.driverId} is not null`,
  ];
  applyPeriodFilters(onLoadConditions, { dateFrom, dateTo, weekStart });
  if (scopedDispatcherId) {
    onLoadConditions.push(eq(loadsTable.dispatcherId, scopedDispatcherId));
  }

  const onLoadRows = await db
    .select({ driverId: loadsTable.driverId })
    .from(loadsTable)
    .where(and(...onLoadConditions));

  const driversOnLoad = new Set(
    onLoadRows
      .map((r) => r.driverId)
      .filter((id): id is string => Boolean(id) && driverIdPool.has(id)),
  ).size;

  const totalDrivers = driverIdPool.size;
  const driversEmpty = Math.max(0, totalDrivers - driversOnLoad);
  const grossPerDriver = totalDrivers > 0 ? totalGross / totalDrivers : 0;

  res.json({
    totalGross,
    totalMiles: Number(result?.totalMiles ?? 0),
    avgRpm: Number(result?.avgRpm ?? 0),
    activeLoads: Number(result?.activeLoads ?? 0),
    brokerPaidTotal: Number(result?.brokerPaidTotal ?? 0),
    unpaidDiff: Number(result?.unpaidDiff ?? 0),
    totalLoads: Number(result?.totalLoads ?? 0),
    deliveredLoads: Number(result?.deliveredLoads ?? 0),
    grossPerDriver,
    totalDrivers,
    driversOnLoad,
    driversEmpty,
    scope: isDispatcher ? "dispatcher" : "company",
  });
});

// GET /api/analytics/ranking
router.get("/ranking", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, weekStart } = req.query as Record<string, string>;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;
  const scopedDispatcherId = isDispatcher ? req.userId! : dispatcherId;

  const conditions = [
    eq(loadsTable.isDeleted, false),
    ne(loadsTable.status, "Canceled"),
  ];
  applyPeriodFilters(conditions, { dateFrom, dateTo, weekStart });
  if (scopedDispatcherId) conditions.push(eq(loadsTable.dispatcherId, scopedDispatcherId));

  const ranking = await db
    .select({
      dispatcherId: loadsTable.dispatcherId,
      gross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
      miles: sql<number>`coalesce(sum(${loadsTable.mileage}::numeric), 0)`,
      loads: sql<number>`count(*)::int`,
      avgRpm: sql<number>`coalesce(avg(${loadsTable.rate}::numeric / nullif(${loadsTable.mileage}::numeric, 0)), 0)`,
    })
    .from(loadsTable)
    .where(and(...conditions))
    .groupBy(loadsTable.dispatcherId)
    .orderBy(sql`sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric) desc`)
    .limit(10);

  const dispatcherIds = ranking.map(r => r.dispatcherId).filter(Boolean) as string[];
  const dispatchers = dispatcherIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, dispatcherIds))
    : [];
  const dispMap = Object.fromEntries(dispatchers.map(d => [d.id, d]));

  const result = ranking.map((r, idx) => {
    const gross = Number(r.gross);
    const avgRpm = Number(r.avgRpm);
    const kpiScore = (gross * avgRpm) / 1000;
    return {
      dispatcherId: r.dispatcherId ?? "",
      dispatcherName: r.dispatcherId ? (dispMap[r.dispatcherId]?.name ?? dispMap[r.dispatcherId]?.email ?? "Unknown") : "Unassigned",
      gross,
      miles: Number(r.miles),
      loads: Number(r.loads),
      avgRpm,
      kpiScore: Math.round(kpiScore * 10) / 10,
    };
  });

  res.json(result);
});

// GET /api/analytics/status-breakdown
router.get("/status-breakdown", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, weekStart } = req.query as Record<string, string>;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;
  const scopedDispatcherId = isDispatcher ? req.userId! : dispatcherId;

  const conditions = [eq(loadsTable.isDeleted, false)];
  applyPeriodFilters(conditions, { dateFrom, dateTo, weekStart });
  if (scopedDispatcherId) conditions.push(eq(loadsTable.dispatcherId, scopedDispatcherId));

  const result = await db
    .select({
      status: loadsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(loadsTable)
    .where(and(...conditions))
    .groupBy(loadsTable.status);

  res.json(result.map(r => ({ status: r.status, count: Number(r.count) })));
});

// GET /api/analytics/drivers-today — live driver status for today (not period filters)
router.get("/drivers-today", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId } = req.query as Record<string, string>;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;
  const scopedDispatcherId = isDispatcher ? req.userId! : dispatcherId || undefined;

  const result = await getDriversTodayStatus(scopedDispatcherId);
  res.json(result);
});

export default router;
