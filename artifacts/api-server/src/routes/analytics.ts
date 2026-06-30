import { Router } from "express";
import { db, driversTable, loadsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, ne, inArray, isNull, type SQL } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { getDriversTodayStatus, ON_LOAD_STATUSES } from "../lib/driver-status-today";
import { mergeWeekBuckets, normalizeWeekStart, weekEndFromStart } from "../lib/week-calendar";
import { applyWeekPeriodFilters } from "../lib/period-filters";
import { isLoadsSpreadsheetLoad } from "../lib/load-board-scope";
import { loadsSpreadsheetCompleteOnlyFilter } from "../lib/load-visibility";

const router = Router();

// GET /api/analytics/kpi
router.get("/kpi", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, driverId, weekStart, weekStarts } = req.query as Record<string, string>;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;
  const scopedDispatcherId = isDispatcher ? req.userId! : dispatcherId;

  const conditions = [
    eq(loadsTable.isDeleted, false),
    isLoadsSpreadsheetLoad(),
    loadsSpreadsheetCompleteOnlyFilter(),
  ];
  applyWeekPeriodFilters(conditions, { dateFrom, dateTo, weekStart, weekStarts });
  if (scopedDispatcherId) conditions.push(eq(loadsTable.dispatcherId, scopedDispatcherId));
  if (driverId) conditions.push(eq(loadsTable.driverId, driverId));
  const where = and(...conditions);

  const [result] = await db
    .select({
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric), 0)`,
      totalMiles: sql<number>`coalesce(sum(${loadsTable.mileage}::numeric), 0)`,
      activeLoads: sql<number>`count(case when ${loadsTable.status} in ('Booked', 'InQM', 'NeedRevRC', 'Issue', 'PickedUp') then 1 end)::int`,
      brokerPaidTotal: sql<number>`coalesce(sum(${loadsTable.brokerPaid}::numeric), 0)`,
      unpaidDiff: sql<number>`coalesce(sum(case when ${loadsTable.brokerPaid}::numeric < ${loadsTable.invoicedAmount}::numeric then ${loadsTable.invoicedAmount}::numeric - ${loadsTable.brokerPaid}::numeric else 0 end), 0)`,
      totalLoads: sql<number>`count(*)::int`,
      deliveredLoads: sql<number>`count(case when ${loadsTable.status} in ('Delivered', 'Completed') then 1 end)::int`,
    })
    .from(loadsTable)
    .where(where);

  const totalGross = Number(result?.totalGross ?? 0);
  const totalMiles = Number(result?.totalMiles ?? 0);
  const avgRpm = totalMiles > 0 ? totalGross / totalMiles : 0;

  let driverIdPool: Set<string>;
  if (isDispatcher || scopedDispatcherId) {
    const poolConditions = [
      eq(loadsTable.isDeleted, false),
      isLoadsSpreadsheetLoad(),
      loadsSpreadsheetCompleteOnlyFilter(),
      eq(loadsTable.dispatcherId, scopedDispatcherId!),
      sql`${loadsTable.driverId} is not null`,
    ];
    applyWeekPeriodFilters(poolConditions, { dateFrom, dateTo, weekStart, weekStarts });

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
      .where(and(eq(driversTable.isActive, true), isNull(driversTable.deletedAt)));
    driverIdPool = new Set(activeDrivers.map((d) => d.id));
  }

  const onLoadConditions = [
    eq(loadsTable.isDeleted, false),
    isLoadsSpreadsheetLoad(),
    loadsSpreadsheetCompleteOnlyFilter(),
    inArray(loadsTable.status, [...ON_LOAD_STATUSES]),
    sql`${loadsTable.driverId} is not null`,
  ];
  applyWeekPeriodFilters(onLoadConditions, { dateFrom, dateTo, weekStart, weekStarts });
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

  let grossPerDriverDenominator = 0;
  if (driverId) {
    grossPerDriverDenominator = 1;
  } else {
    const driverRows = await db
      .selectDistinct({ driverId: loadsTable.driverId })
      .from(loadsTable)
      .where(and(...conditions, sql`${loadsTable.driverId} is not null`));
    grossPerDriverDenominator = driverRows.filter((r) => r.driverId).length;
  }
  const grossPerDriver = grossPerDriverDenominator > 0 ? totalGross / grossPerDriverDenominator : 0;

  res.json({
    totalGross,
    totalMiles,
    avgRpm,
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

// GET /api/analytics/ranking — company-wide leaderboard (optional dispatcherId filter)
router.get("/ranking", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, weekStart, weekStarts } = req.query as Record<string, string>;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const conditions = [
    eq(loadsTable.isDeleted, false),
    isLoadsSpreadsheetLoad(),
    loadsSpreadsheetCompleteOnlyFilter(),
    ne(loadsTable.status, "Canceled"),
    sql`${loadsTable.dispatcherId} is not null`,
  ];
  applyWeekPeriodFilters(conditions, { dateFrom, dateTo, weekStart, weekStarts });
  if (dispatcherId) conditions.push(eq(loadsTable.dispatcherId, dispatcherId));

  const loadStats = await db
    .select({
      dispatcherId: loadsTable.dispatcherId,
      gross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric), 0)`,
      miles: sql<number>`coalesce(sum(${loadsTable.mileage}::numeric), 0)`,
      loads: sql<number>`count(*)::int`,
    })
    .from(loadsTable)
    .where(and(...conditions))
    .groupBy(loadsTable.dispatcherId);

  const statsByDispatcher = new Map(
    loadStats
      .filter((r) => r.dispatcherId)
      .map((r) => [r.dispatcherId!, r]),
  );

  const dispatcherConditions = [eq(usersTable.role, "dispatcher"), eq(usersTable.isActive, true)];
  if (dispatcherId) dispatcherConditions.push(eq(usersTable.id, dispatcherId));

  const allDispatchers = await db
    .select()
    .from(usersTable)
    .where(and(...dispatcherConditions))
    .orderBy(usersTable.name);

  const result = allDispatchers
    .map((d) => {
      const stats = statsByDispatcher.get(d.id);
      const gross = Number(stats?.gross ?? 0);
      const miles = Number(stats?.miles ?? 0);
      const avgRpm = miles > 0 ? gross / miles : 0;
      const kpiScore = Math.round(((gross * avgRpm) / 1000) * 10) / 10;
      return {
        dispatcherId: d.id,
        dispatcherName: d.name ?? d.email ?? "Unknown",
        gross,
        miles: Number(stats?.miles ?? 0),
        loads: Number(stats?.loads ?? 0),
        avgRpm,
        kpiScore,
      };
    })
    .sort((a, b) => b.kpiScore - a.kpiScore || b.gross - a.gross);

  res.json(result);
});

// GET /api/analytics/status-breakdown
router.get("/status-breakdown", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, weekStart, weekStarts } = req.query as Record<string, string>;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;
  const scopedDispatcherId = isDispatcher ? req.userId! : dispatcherId;

  const conditions = [
    eq(loadsTable.isDeleted, false),
    isLoadsSpreadsheetLoad(),
    loadsSpreadsheetCompleteOnlyFilter(),
  ];
  applyWeekPeriodFilters(conditions, { dateFrom, dateTo, weekStart, weekStarts });
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

// GET /api/analytics/drivers-today — driver statusboard by calendar week (loads board weekStart)
router.get("/drivers-today", requireAuth, async (req: AuthRequest, res) => {
  const { dispatcherId, scope } = req.query as Record<string, string>;
  const isDispatcher = req.userRole === "dispatcher" && req.userId;

  if (isDispatcher) {
    const effectiveScope = scope === "mine" ? "mine" : "company";
    const result = await getDriversTodayStatus({
      scope: effectiveScope,
      dispatcherId: effectiveScope === "mine" ? req.userId! : undefined,
      weekStart: req.query.weekStart as string | undefined,
      weekStarts: req.query.weekStarts as string | undefined,
      viewerUserId: req.userId,
      viewerRole: req.userRole,
    });
    res.json(result);
    return;
  }

  const result = await getDriversTodayStatus({
    ...(dispatcherId
      ? { scope: "mine" as const, dispatcherId }
      : { scope: "company" as const }),
    weekStart: req.query.weekStart as string | undefined,
    weekStarts: req.query.weekStarts as string | undefined,
    viewerUserId: req.userId,
    viewerRole: req.userRole,
  });
  res.json(result);
});

export default router;
