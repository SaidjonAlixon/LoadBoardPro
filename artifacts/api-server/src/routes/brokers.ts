import { Router } from "express";
import { db, brokersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const brokers = await db.select().from(brokersTable).orderBy(brokersTable.name);
  res.json(brokers.map(serialize));
});

router.post("/", requireAuth, async (req, res) => {
  const { name, mcNumber, contact, email, phone } = req.body;
  const [broker] = await db.insert(brokersTable).values({
    id: crypto.randomUUID(),
    name,
    mcNumber: mcNumber ?? null,
    contact: contact ?? null,
    email: email ?? null,
    phone: phone ?? null,
  }).returning();
  res.status(201).json(serialize(broker));
});

router.patch("/:id", requireAuth, async (req, res) => {
  const { name, mcNumber, contact, email, phone } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (mcNumber !== undefined) updates.mcNumber = mcNumber;
  if (contact !== undefined) updates.contact = contact;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;

  const [updated] = await db.update(brokersTable).set(updates).where(eq(brokersTable.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(updated));
});

function serialize(b: typeof brokersTable.$inferSelect) {
  return {
    id: b.id,
    name: b.name,
    mcNumber: b.mcNumber,
    contact: b.contact,
    email: b.email,
    phone: b.phone,
    createdAt: b.createdAt,
  };
}

export default router;
