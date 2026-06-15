import { Router } from "express";
import { db, driversTable, loadsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

// GET /api/drivers
router.get("/", requireAuth, async (req, res) => {
  const { isActive, driverType } = req.query;
  const conditions = [];
  if (isActive !== undefined) conditions.push(eq(driversTable.isActive, isActive === "true"));
  if (driverType) conditions.push(eq(driversTable.driverType, driverType as any));

  const drivers = conditions.length > 0
    ? await db.select().from(driversTable).where(and(...conditions)).orderBy(driversTable.fullName)
    : await db.select().from(driversTable).orderBy(driversTable.fullName);

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

// GET /api/drivers/:id
router.get("/:id", requireAuth, async (req, res) => {
  const driver = await db.query.driversTable.findFirst({ where: eq(driversTable.id, req.params.id) });
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
router.patch("/:id", requireAuth, async (req, res) => {
  const { fullName, driverType, phone, email, truckNumber, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (driverType !== undefined) updates.driverType = driverType;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (truckNumber !== undefined) updates.truckNumber = truckNumber;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db.update(driversTable).set(updates).where(eq(driversTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeDriver(updated));
});

// DELETE /api/drivers/:id (archive)
router.delete("/:id", requireAuth, async (req, res) => {
  await db.update(driversTable).set({ isActive: false }).where(eq(driversTable.id, req.params.id));
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
