import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

// GET /api/users/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  res.json(serializeUser(req.dbUser!));
});

// PATCH /api/users/me
router.patch("/me", requireAuth, async (req: AuthRequest, res) => {
  const { name } = req.body;
  const [updated] = await db
    .update(usersTable)
    .set({ name })
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json(serializeUser(updated));
});

// GET /api/users (admin only)
router.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map(serializeUser));
});

// POST /api/users (admin only)
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { email, name, role } = req.body;
  const [user] = await db.insert(usersTable).values({
    id: crypto.randomUUID(),
    clerkId: `manual_${crypto.randomUUID()}`,
    email,
    name,
    role,
  }).returning();
  res.status(201).json(serializeUser(user));
});

// PATCH /api/users/:id (admin only)
router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.params.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeUser(updated));
});

function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    clerkId: u.clerkId,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

export default router;
