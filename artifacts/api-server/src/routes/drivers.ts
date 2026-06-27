import { Router } from "express";
import { db, driversTable, loadsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql, gte, lte, isNull } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import { isLoadDispatcherLocked } from "../lib/load-statuses";
import { getThisWeekStart, normalizeWeekStart, weekEndFromStart } from "../lib/week-calendar";

const router = Router();

// GET /api/drivers — excludes soft-deleted drivers (deleted_at set)
router.get("/", requireAuth, async (req, res) => {
  const { isActive, driverType } = req.query;
  const conditions = [isNull(driversTable.deletedAt)];
  if (isActive !== undefined) conditions.push(eq(driversTable.isActive, isActive === "true"));
  if (driverType) conditions.push(eq(driversTable.driverType, driverType as any));

  const drivers = await db
    .select()
    .from(driversTable)
    .where(and(...conditions))
    .orderBy(driversTable.fullName);

  res.json(drivers.map(serializeDriver));
});

// POST /api/drivers
router.post("/", requireAuth, async (req, res) => {
  const { fullName, driverType, phone, email, truckNumber } = req.body;
  const [driver] = await db.insert(driversTable).values({
    id: crypto.randomUUID(),
    fullName,
    driverType,
    phone: phone ?? null,
    email: email ?? null,
    truckNumber: truckNumber ?? null,
  }).returning();
  res.status(201).json(serializeDriver(driver));
});

// DELETE /api/drivers/:id/week-loads?weekStart=YYYY-MM-DD — soft-delete this driver's loads in one calendar week only
router.delete("/:id/week-loads", requireAuth, requireRole("admin", "dispatcher"), async (req: AuthRequest, res) => {
  const driverId = req.params.id;
  const weekStart = normalizeWeekStart((req.query.weekStart as string) || getThisWeekStart());
  const weekEnd = weekEndFromStart(weekStart);

  const driver = await db.query.driversTable.findFirst({
    where: and(eq(driversTable.id, driverId), isNull(driversTable.deletedAt)),
  });
  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  const conditions = [
    eq(loadsTable.driverId, driverId),
    eq(loadsTable.isDeleted, false),
    gte(loadsTable.puDate, weekStart),
    lte(loadsTable.puDate, weekEnd),
  ];
  if (req.userRole === "dispatcher" && req.userId) {
    conditions.push(eq(loadsTable.dispatcherId, req.userId));
  }

  const loads = await db.select().from(loadsTable).where(and(...conditions));
  if (!loads.length) {
    res.json({ deletedCount: 0 });
    return;
  }

  for (const load of loads) {
    if (req.userRole === "dispatcher" && isLoadDispatcherLocked(load.status)) {
      res.status(403).json({ error: "Some loads are locked for accounting review" });
      return;
    }
  }

  const deleted = await db
    .update(loadsTable)
    .set({ isDeleted: true })
    .where(and(...conditions))
    .returning({ id: loadsTable.id });

  res.json({ deletedCount: deleted.length });
});

// GET /api/drivers/:id
router.get("/:id", requireAuth, async (req, res) => {
  const driver = await db.query.driversTable.findFirst({
    where: and(eq(driversTable.id, req.params.id), isNull(driversTable.deletedAt)),
  });
  if (!driver) { res.status(404).json({ error: "Not found" }); return; }

  const loads = await db.select().from(loadsTable)
    .where(and(eq(loadsTable.driverId, driver.id), eq(loadsTable.isDeleted, false)))
    .orderBy(desc(loadsTable.createdAt))
    .limit(20);

  const statsResult = await db
    .select({
      totalLoads: sql<number>`count(*)::int`,
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
      avgRpm: sql<number>`coalesce(avg(${loadsTable.rate}::numeric / nullif(${loadsTable.mileage}::numeric, 0)), 0)`,
      lastActivityDate: sql<string | null>`max(${loadsTable.updatedAt})::text`,
    })
    .from(loadsTable)
    .where(and(eq(loadsTable.driverId, driver.id), eq(loadsTable.isDeleted, false)));

  const stats = statsResult[0] ?? { totalLoads: 0, totalGross: 0, avgRpm: 0, lastActivityDate: null };

  res.json({
    ...serializeDriver(driver),
    stats: {
      totalLoads: Number(stats.totalLoads),
      totalGross: Number(stats.totalGross),
      avgRpm: Number(stats.avgRpm),
      lastActivityDate: stats.lastActivityDate,
    },
    recentLoads: loads.map(serializeLoadBasic),
  });
});

// PATCH /api/drivers/:id
const BOARD_STATUSES = [
  "Ready", "Covered", "Deadhead", "AtPickUp", "InTransit",
  "AtDelivery", "TruckIssue", "Sleep", "Home",
] as const;

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const { fullName, driverType, phone, email, truckNumber, isActive, currentLocation, boardStatus, boardNote, prebook, odometer, eta } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (driverType !== undefined) updates.driverType = driverType;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (truckNumber !== undefined) updates.truckNumber = truckNumber;
  if (isActive !== undefined) updates.isActive = isActive;
  if (currentLocation !== undefined) updates.currentLocation = currentLocation || null;
  if (boardStatus !== undefined) {
    if (!BOARD_STATUSES.includes(boardStatus)) {
      res.status(400).json({ error: "Invalid board status" });
      return;
    }
    updates.boardStatus = boardStatus;
  }
  if (boardNote !== undefined) updates.boardNote = boardNote || null;
  if (prebook !== undefined) updates.prebook = prebook || null;
  if (odometer !== undefined) updates.odometer = odometer === null || odometer === "" ? null : Number(odometer);
  if (eta !== undefined) updates.eta = eta || null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(driversTable)
      .set(updates)
      .where(and(eq(driversTable.id, req.params.id), isNull(driversTable.deletedAt)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(serializeDriver(updated));
  } catch (err) {
    console.error("PATCH /api/drivers/:id failed", err);
    res.status(500).json({ error: "Failed to update driver" });
  }
});

// DELETE /api/drivers/:id — admin soft-delete; past-week loads keep driver_id
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const [deleted] = await db
    .update(driversTable)
    .set({ isActive: false, deletedAt: new Date() })
    .where(and(eq(driversTable.id, req.params.id), isNull(driversTable.deletedAt)))
    .returning({ id: driversTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }
  res.status(204).send();
});

function serializeDriver(d: typeof driversTable.$inferSelect) {
  return {
    id: d.id,
    fullName: d.fullName,
    driverType: d.driverType,
    phone: d.phone,
    email: d.email,
    truckNumber: d.truckNumber,
    currentLocation: d.currentLocation,
    boardStatus: d.boardStatus ?? "Ready",
    boardNote: d.boardNote,
    prebook: d.prebook,
    odometer: d.odometer,
    eta: d.eta,
    isActive: d.isActive,
    createdAt: d.createdAt,
  };
}

function serializeLoadBasic(l: typeof loadsTable.$inferSelect) {
  return {
    id: l.id,
    loadNumber: l.loadNumber,
    puDate: l.puDate,
    delDate: l.delDate,
    originCity: l.originCity,
    originState: l.originState,
    destCity: l.destCity,
    destState: l.destState,
    mileage: Number(l.mileage),
    rate: Number(l.rate),
    status: l.status,
    weekStart: l.weekStart,
  };
}

export default router;
