import { Router } from "express";
import { db, loadsTable, driversTable, usersTable, brokersTable, notificationsTable } from "@workspace/db";
import { eq, and, or, like, ilike, desc, gte, lte, sql, inArray, asc, isNull } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import { isLoadDispatcherLocked } from "../lib/load-statuses";
import { getMondayOfWeek, normalizeWeekStart, todayIsoLocal, weekEndFromStart } from "../lib/week-calendar";
import { applyWeekPeriodFilters } from "../lib/period-filters";
import {
  isDraftLoadNumberValue,
  validateDispatcherLoadInput,
} from "../lib/validate-load";

const router = Router();

function computeDiffs(load: typeof loadsTable.$inferSelect) {
  const rate = Number(load.rate);
  const reimb = Number(load.reimbursement);
  const invoiced = load.invoicedAmount !== null ? Number(load.invoicedAmount) : null;
  const paid = load.brokerPaid !== null ? Number(load.brokerPaid) : null;

  const irDiff = invoiced !== null ? invoiced - (rate + reimb) : null;
  const biDiff = paid !== null && invoiced !== null ? paid - invoiced : null;
  const rpm = Number(load.mileage) > 0 ? rate / Number(load.mileage) : null;

  return { irDiff, biDiff, rpm };
}

function serializeLoad(
  l: typeof loadsTable.$inferSelect,
  extras?: {
    driver?: typeof driversTable.$inferSelect | null;
    dispatcher?: typeof usersTable.$inferSelect | null;
    broker?: typeof brokersTable.$inferSelect | null;
  }
) {
  const { irDiff, biDiff, rpm } = computeDiffs(l);
  return {
    id: l.id,
    loadNumber: l.loadNumber,
    driverId: l.driverId,
    driver: extras?.driver ? serializeDriver(extras.driver) : undefined,
    dispatcherId: l.dispatcherId,
    dispatcher: extras?.dispatcher ? serializeUser(extras.dispatcher) : undefined,
    brokerId: l.brokerId,
    broker: extras?.broker ? serializeBroker(extras.broker) : undefined,
    puDate: l.puDate,
    delDate: l.delDate,
    originCity: l.originCity,
    originState: l.originState,
    destCity: l.destCity,
    destState: l.destState,
    mileage: Number(l.mileage),
    rate: Number(l.rate),
    rpm,
    status: l.status,
    reimbursement: Number(l.reimbursement),
    dispatchNotes: l.dispatchNotes,
    invoicedAmount: l.invoicedAmount !== null ? Number(l.invoicedAmount) : null,
    brokerPaid: l.brokerPaid !== null ? Number(l.brokerPaid) : null,
    notes: l.notes,
    weekStart: l.weekStart,
    sortOrder: l.sortOrder,
    irDiff,
    biDiff,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function serializeDriver(d: typeof driversTable.$inferSelect) {
  return { id: d.id, fullName: d.fullName, driverType: d.driverType, phone: d.phone, email: d.email, truckNumber: d.truckNumber, isActive: d.isActive, createdAt: d.createdAt };
}
function serializeUser(u: typeof usersTable.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
}
function serializeBroker(b: typeof brokersTable.$inferSelect) {
  return { id: b.id, name: b.name, mcNumber: b.mcNumber, contact: b.contact, email: b.email, phone: b.phone, createdAt: b.createdAt };
}

// GET /api/loads
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const {
    status, driverId, dispatcherId, brokerId, weekStart, weekStarts,
    dateFrom, dateTo, search, page = "1", limit = "50"
  } = req.query as Record<string, string>;

  const conditions = [eq(loadsTable.isDeleted, false)];

  if (status) conditions.push(eq(loadsTable.status, status as any));
  if (driverId) conditions.push(eq(loadsTable.driverId, driverId));
  if (dispatcherId) conditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  if (brokerId) conditions.push(eq(loadsTable.brokerId, brokerId));
  applyWeekPeriodFilters(conditions, { dateFrom, dateTo, weekStart, weekStarts });
  if (search) {
    conditions.push(
      or(
        ilike(loadsTable.loadNumber, `%${search}%`),
        ilike(loadsTable.originCity, `%${search}%`),
        ilike(loadsTable.destCity, `%${search}%`),
      )!
    );
  }

  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 200);
  const offset = (pageNum - 1) * limitNum;

  const [loads, countResult] = await Promise.all([
    db.select().from(loadsTable).where(and(...conditions)).orderBy(asc(loadsTable.sortOrder), asc(loadsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(loadsTable).where(and(...conditions)),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Fetch related entities
  const driverIds = [...new Set(loads.map(l => l.driverId).filter(Boolean))] as string[];
  const dispatcherIds = [...new Set(loads.map(l => l.dispatcherId).filter(Boolean))] as string[];
  const brokerIds = [...new Set(loads.map(l => l.brokerId).filter(Boolean))] as string[];

  const [drivers, dispatchers, brokers] = await Promise.all([
    driverIds.length ? db.select().from(driversTable).where(inArray(driversTable.id, driverIds)) : [],
    dispatcherIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, dispatcherIds)) : [],
    brokerIds.length ? db.select().from(brokersTable).where(inArray(brokersTable.id, brokerIds)) : [],
  ]);

  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const dispatcherMap = Object.fromEntries(dispatchers.map(d => [d.id, d]));
  const brokerMap = Object.fromEntries(brokers.map(b => [b.id, b]));

  res.json({
    data: loads.map(l => serializeLoad(l, {
      driver: l.driverId ? driverMap[l.driverId] : null,
      dispatcher: l.dispatcherId ? dispatcherMap[l.dispatcherId] : null,
      broker: l.brokerId ? brokerMap[l.brokerId] : null,
    })),
    total,
    page: pageNum,
    limit: limitNum,
  });
});

// POST /api/loads
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const {
    loadNumber, driverId, dispatcherId, brokerId,
    puDate, delDate, originCity, originState, destCity, destState,
    mileage, rate, status, reimbursement, dispatchNotes, notes, weekStart
  } = req.body;

  const driverKey = driverId ?? null;
  const driverCondition = driverKey
    ? eq(loadsTable.driverId, driverKey)
    : isNull(loadsTable.driverId);
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${loadsTable.sortOrder}), -1)` })
    .from(loadsTable)
    .where(and(eq(loadsTable.isDeleted, false), driverCondition));

  const resolvedWeekStart = getMondayOfWeek(puDate || weekStart || todayIsoLocal());

  const isDispatcherRole = req.userRole === "dispatcher" || req.userRole === "admin";
  if (isDispatcherRole && !isDraftLoadNumberValue(loadNumber)) {
    const errors = validateDispatcherLoadInput({
      loadNumber,
      puDate,
      delDate,
      originCity,
      originState,
      destCity,
      destState,
      mileage,
      rate,
      reimbursement,
      status: status ?? "Booked",
    });
    if (errors.length > 0) {
      res.status(400).json({ error: `Required fields: ${errors.join(", ")}` });
      return;
    }
  }

  const [load] = await db.insert(loadsTable).values({
    id: crypto.randomUUID(),
    loadNumber,
    driverId: driverId ?? null,
    dispatcherId: dispatcherId ?? req.userId!,
    brokerId: brokerId ?? null,
    puDate,
    delDate,
    originCity,
    originState,
    destCity,
    destState,
    mileage: String(mileage),
    rate: String(rate),
    status: status ?? "Booked",
    reimbursement: String(reimbursement ?? 0),
    dispatchNotes: dispatchNotes ?? null,
    notes: notes ?? null,
    weekStart: resolvedWeekStart,
    sortOrder: Number(maxRow?.max ?? -1) + 1,
  }).returning();

  res.status(201).json(serializeLoad(load));
});

// POST /api/loads/reorder — reorder loads within a driver group
router.post("/reorder", requireAuth, requireRole("admin", "dispatcher"), async (req: AuthRequest, res) => {
  const { driverId, loadIds } = req.body as { driverId?: string | null; loadIds?: string[] };

  if (!Array.isArray(loadIds) || loadIds.length === 0) {
    res.status(400).json({ error: "loadIds required" });
    return;
  }

  const normalizedDriverId = driverId ?? null;
  const rows = await db
    .select()
    .from(loadsTable)
    .where(and(eq(loadsTable.isDeleted, false), inArray(loadsTable.id, loadIds)));

  if (rows.length !== loadIds.length) {
    res.status(400).json({ error: "Invalid load ids" });
    return;
  }

  for (const row of rows) {
    if ((row.driverId ?? null) !== normalizedDriverId) {
      res.status(400).json({ error: "Loads must belong to the same driver" });
      return;
    }
    if (req.userRole === "dispatcher" && row.dispatcherId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (req.userRole === "dispatcher" && isLoadDispatcherLocked(row.status)) {
      res.status(403).json({ error: "Load is locked for accounting review" });
      return;
    }
  }

  await Promise.all(
    loadIds.map((id, index) =>
      db.update(loadsTable).set({ sortOrder: index }).where(eq(loadsTable.id, id)),
    ),
  );

  res.status(204).send();
});

// GET /api/loads/:id
router.get("/:id", requireAuth, async (req, res) => {
  const load = await db.query.loadsTable.findFirst({ where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)) });
  if (!load) { res.status(404).json({ error: "Not found" }); return; }

  const [driver, dispatcher, broker] = await Promise.all([
    load.driverId ? db.query.driversTable.findFirst({ where: eq(driversTable.id, load.driverId) }) : null,
    load.dispatcherId ? db.query.usersTable.findFirst({ where: eq(usersTable.id, load.dispatcherId) }) : null,
    load.brokerId ? db.query.brokersTable.findFirst({ where: eq(brokersTable.id, load.brokerId) }) : null,
  ]);

  res.json(serializeLoad(load, { driver, dispatcher, broker }));
});

// PATCH /api/loads/:id
router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const load = await db.query.loadsTable.findFirst({ where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)) });
  if (!load) { res.status(404).json({ error: "Not found" }); return; }

  if (isLoadDispatcherLocked(load.status) && req.userRole !== "accounting") {
    res.status(403).json({ error: "Load is locked for accounting review" });
    return;
  }

  if (req.userRole === "dispatcher" && load.dispatcherId !== req.userId) {
    res.status(403).json({ error: "You can only edit your own loads" });
    return;
  }

  // Role-based field restrictions
  const isAccounting = req.userRole === "accounting";
  const isDispatcher = req.userRole === "dispatcher";

  const dispatcherFields = [
    "loadNumber", "brokerId",
    "puDate", "delDate", "originCity", "originState", "destCity", "destState",
    "mileage", "rate", "reimbursement", "dispatchNotes", "status",
  ];
  const accountingFields = ["invoicedAmount", "brokerPaid", "notes", "status"];

  const allowed = isAccounting
    ? accountingFields
    : isDispatcher
      ? dispatcherFields
      : Object.keys(req.body);

  const updates: Record<string, unknown> = {};
  const body = req.body;

  const fieldMap: Record<string, string> = {
    loadNumber: "loadNumber",
    driverId: "driverId",
    dispatcherId: "dispatcherId",
    brokerId: "brokerId",
    puDate: "puDate",
    delDate: "delDate",
    originCity: "originCity",
    originState: "originState",
    destCity: "destCity",
    destState: "destState",
    mileage: "mileage",
    rate: "rate",
    status: "status",
    reimbursement: "reimbursement",
    dispatchNotes: "dispatchNotes",
    invoicedAmount: "invoicedAmount",
    brokerPaid: "brokerPaid",
    notes: "notes",
  };

  for (const key of allowed) {
    if (key in fieldMap && body[key] !== undefined) {
      if (key === "status" && isDispatcher) {
        const dispatcherStatuses = [
          "Booked", "InQM", "Delivered", "Canceled", "Completed", "NeedRevRC", "Issue",
        ];
        if (!dispatcherStatuses.includes(body[key])) {
          res.status(403).json({ error: "Invalid status for dispatcher" });
          return;
        }
      }
      const col = fieldMap[key];
      if (["mileage", "rate", "reimbursement", "invoicedAmount", "brokerPaid"].includes(col)) {
        updates[col] = body[key] !== null ? String(body[key]) : null;
      } else {
        updates[col] = body[key];
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  if ("driverId" in updates && (updates.driverId ?? null) !== (load.driverId ?? null)) {
    const nextDriverId = (updates.driverId as string | null) ?? null;
    const driverCondition = nextDriverId
      ? eq(loadsTable.driverId, nextDriverId)
      : isNull(loadsTable.driverId);
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${loadsTable.sortOrder}), -1)` })
      .from(loadsTable)
      .where(and(eq(loadsTable.isDeleted, false), driverCondition));
    updates.sortOrder = Number(maxRow?.max ?? -1) + 1;
  }

  if ("puDate" in updates && updates.puDate) {
    updates.weekStart = getMondayOfWeek(String(updates.puDate));
  }

  const isDispatcherRole = req.userRole === "dispatcher" || req.userRole === "admin";
  if (isDispatcherRole && "loadNumber" in updates) {
    const num = String(updates.loadNumber ?? "").trim();
    if (!num || num.startsWith("NEW-")) {
      res.status(400).json({ error: "Invalid load number" });
      return;
    }
  }

  const [updated] = await db.update(loadsTable).set(updates).where(eq(loadsTable.id, req.params.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Notify accounting if B-I diff is negative
  const { biDiff } = computeDiffs(updated);
  if (biDiff !== null && biDiff < 0) {
    // Find accounting users to notify
    const accountingUsers = await db.select().from(usersTable).where(eq(usersTable.role, "accounting"));
    for (const user of accountingUsers) {
      await db.insert(notificationsTable).values({
        id: crypto.randomUUID(),
        userId: user.id,
        text: `Broker underpaid on Load #${updated.loadNumber}. Difference: $${Math.abs(biDiff).toFixed(2)}`,
        loadId: updated.id,
      });
    }
  }

  res.json(serializeLoad(updated));
});

// DELETE /api/loads/:id (admin + dispatcher, soft delete)
router.delete("/:id", requireAuth, requireRole("admin", "dispatcher"), async (req: AuthRequest, res) => {
  const load = await db.query.loadsTable.findFirst({
    where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)),
  });
  if (!load) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.userRole === "dispatcher" && load.dispatcherId !== req.userId) {
    res.status(403).json({ error: "You can only delete your own loads" });
    return;
  }
  if (req.userRole === "dispatcher" && isLoadDispatcherLocked(load.status)) {
    res.status(403).json({ error: "Load is locked for accounting review" });
    return;
  }
  await db.update(loadsTable).set({ isDeleted: true }).where(eq(loadsTable.id, req.params.id));
  res.status(204).send();
});

// GET /api/accounting/summary
router.get("/accounting/summary", requireAuth, async (req, res) => {
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
      diffIssues: sql<number>`count(case when ${loadsTable.brokerPaid}::numeric < ${loadsTable.invoicedAmount}::numeric then 1 end)::int`,
    })
    .from(loadsTable)
    .where(and(...conditions));

  const weekStartStr = getMondayOfWeek(todayIsoLocal());

  const weekResult = await db
    .select({ brokerPaidThisWeek: sql<number>`coalesce(sum(${loadsTable.brokerPaid}::numeric), 0)` })
    .from(loadsTable)
    .where(
      and(
        eq(loadsTable.isDeleted, false),
        gte(loadsTable.puDate, weekStartStr),
        lte(loadsTable.puDate, weekEndFromStart(weekStartStr)),
      ),
    );

  res.json({
    totalInvoiced: Number(result[0]?.totalInvoiced ?? 0),
    brokerPaidThisWeek: Number(weekResult[0]?.brokerPaidThisWeek ?? 0),
    outstanding: Number(result[0]?.outstanding ?? 0),
    diffIssues: Number(result[0]?.diffIssues ?? 0),
  });
});

export default router;
