import { Router } from "express";
import { db, loadsTable, driversTable, usersTable, brokersTable, notificationsTable } from "@workspace/db";
import { eq, and, or, like, ilike, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";

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
  return { id: u.id, clerkId: u.clerkId, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
}
function serializeBroker(b: typeof brokersTable.$inferSelect) {
  return { id: b.id, name: b.name, mcNumber: b.mcNumber, contact: b.contact, email: b.email, phone: b.phone, createdAt: b.createdAt };
}

// GET /api/loads
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const {
    status, driverId, dispatcherId, brokerId, weekStart,
    dateFrom, dateTo, search, page = "1", limit = "50"
  } = req.query as Record<string, string>;

  const conditions = [eq(loadsTable.isDeleted, false)];

  // Dispatcher can only see their own loads
  if (req.userRole === "dispatcher") {
    conditions.push(eq(loadsTable.dispatcherId, req.userId!));
  }

  if (status) conditions.push(eq(loadsTable.status, status as any));
  if (driverId) conditions.push(eq(loadsTable.driverId, driverId));
  if (dispatcherId) conditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  if (brokerId) conditions.push(eq(loadsTable.brokerId, brokerId));
  if (weekStart) conditions.push(eq(loadsTable.weekStart, weekStart));
  if (dateFrom) conditions.push(gte(loadsTable.puDate, dateFrom));
  if (dateTo) conditions.push(lte(loadsTable.puDate, dateTo));
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
    db.select().from(loadsTable).where(and(...conditions)).orderBy(desc(loadsTable.createdAt)).limit(limitNum).offset(offset),
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
    weekStart,
  }).returning();

  res.status(201).json(serializeLoad(load));
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

  // Accounting role: can only update invoicedAmount, brokerPaid, notes
  const isAccounting = req.userRole === "accounting";
  const allowed = isAccounting
    ? ["invoicedAmount", "brokerPaid", "notes"]
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
      const col = fieldMap[key];
      if (["mileage", "rate", "reimbursement", "invoicedAmount", "brokerPaid"].includes(col)) {
        updates[col] = body[key] !== null ? String(body[key]) : null;
      } else {
        updates[col] = body[key];
      }
    }
  }

  const [updated] = await db.update(loadsTable).set(updates).where(eq(loadsTable.id, req.params.id)).returning();

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

// DELETE /api/loads/:id (admin only, soft delete)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.update(loadsTable).set({ isDeleted: true }).where(eq(loadsTable.id, req.params.id));
  res.status(204).send();
});

// GET /api/accounting/summary
router.get("/accounting/summary", requireAuth, async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions = [eq(loadsTable.isDeleted, false), eq(loadsTable.status, "Delivered")];
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

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
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
