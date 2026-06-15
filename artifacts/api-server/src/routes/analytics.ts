import { Router } from "express";
import { db, loadsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, sql, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /api/analytics/kpi
router.get("/kpi", requireAuth, async (req, res) => {
  const { dateFrom, dateTo, dispatcherId, driverId } = req.query as Record<string, string>;

  const conditions = [eq(loadsTable.isDeleted, false)];
  if (dateFrom) conditions.push(gte(loadsTable.puDate, dateFrom));
  if (dateTo) conditions.push(lte(loadsTable.puDate, dateTo));
  if (dispatcherId) conditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  if (driverId) conditions.push(eq(loadsTable.driverId, driverId));
  const where = and(...conditions);

  const [result] = await db
    .select({
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
      totalMiles: sql<number>`coalesce(sum(${loadsTable.mileage}::numeric), 0)`,
      avgRpm: sql<number>`coalesce(avg(${loadsTable.rate}::numeric / nullif(${loadsTable.mileage}::numeric, 0)), 0)`,
      activeLoads: sql<number>`count(case when ${loadsTable.status} in ('Booked', 'PickedUp') then 1 end)::int`,
      brokerPaidTotal: sql<number>`coalesce(sum(${loadsTable.brokerPaid}::numeric), 0)`,
      unpaidDiff: sql<number>`coalesce(sum(case when ${loadsTable.brokerPaid}::numeric < ${loadsTable.invoicedAmount}::numeric then ${loadsTable.invoicedAmount}::numeric - ${loadsTable.brokerPaid}::numeric else 0 end), 0)`,
      totalLoads: sql<number>`count(*)::int`,
      deliveredLoads: sql<number>`count(case when ${loadsTable.status} = 'Delivered' then 1 end)::int`,
    })
    .from(loadsTable)
    .where(where);

  res.json({
    totalGross: Number(result?.totalGross ?? 0),
    totalMiles: Number(result?.totalMiles ?? 0),
    avgRpm: Number(result?.avgRpm ?? 0),
    activeLoads: Number(result?.activeLoads ?? 0),
    brokerPaidTotal: Number(result?.brokerPaidTotal ?? 0),
    unpaidDiff: Number(result?.unpaidDiff ?? 0),
    totalLoads: Number(result?.totalLoads ?? 0),
    deliveredLoads: Number(result?.deliveredLoads ?? 0),
  });
});

// GET /api/analytics/ranking
router.get("/ranking", requireAuth, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;

  const conditions = [
    eq(loadsTable.isDeleted, false),
    ne(loadsTable.status, "Canceled"),
  ];
  if (dateFrom) conditions.push(gte(loadsTable.puDate, dateFrom));
  if (dateTo) conditions.push(lte(loadsTable.puDate, dateTo));

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
    ? await db.select().from(usersTable).where(
        sql`${usersTable.id} = ANY(${JSON.stringify(dispatcherIds)}::text[])`
      )
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
router.get("/status-breakdown", requireAuth, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions = [eq(loadsTable.isDeleted, false)];
  if (dateFrom) conditions.push(gte(loadsTable.puDate, dateFrom));
  if (dateTo) conditions.push(lte(loadsTable.puDate, dateTo));

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

export default router;
