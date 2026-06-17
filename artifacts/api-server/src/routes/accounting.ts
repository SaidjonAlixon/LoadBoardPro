import { Router } from "express";
import { db, loadsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /api/accounting/summary
router.get("/summary", requireAuth, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions = [
    eq(loadsTable.isDeleted, false),
    inArray(loadsTable.status, ["Delivered", "Completed"]),
  ];
  if (dateFrom) conditions.push(gte(loadsTable.puDate, dateFrom));
  if (dateTo) conditions.push(lte(loadsTable.puDate, dateTo));

  const result = await db
    .select({
      totalInvoiced: sql<number>`coalesce(sum(${loadsTable.invoicedAmount}::numeric), 0)`,
      outstanding: sql<number>`coalesce(sum(case when ${loadsTable.brokerPaid} is null then ${loadsTable.invoicedAmount}::numeric else 0 end), 0)`,
      diffIssues: sql<number>`count(case when ${loadsTable.brokerPaid} is not null and ${loadsTable.invoicedAmount} is not null and ${loadsTable.brokerPaid}::numeric < ${loadsTable.invoicedAmount}::numeric then 1 end)::int`,
    })
    .from(loadsTable)
    .where(and(...conditions));

  const weekStart = new Date();
  const dayOfWeek = weekStart.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - daysToMonday);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const weekResult = await db
    .select({ brokerPaidThisWeek: sql<number>`coalesce(sum(${loadsTable.brokerPaid}::numeric), 0)` })
    .from(loadsTable)
    .where(and(eq(loadsTable.isDeleted, false), gte(loadsTable.weekStart, weekStartStr)));

  res.json({
    totalInvoiced: Number(result[0]?.totalInvoiced ?? 0),
    brokerPaidThisWeek: Number(weekResult[0]?.brokerPaidThisWeek ?? 0),
    outstanding: Number(result[0]?.outstanding ?? 0),
    diffIssues: Number(result[0]?.diffIssues ?? 0),
  });
});

export default router;
