import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { unreadOnly } = req.query;
  const conditions = [eq(notificationsTable.userId, req.userId!)];
  if (unreadOnly === "true") conditions.push(eq(notificationsTable.isRead, false));

  const notifications = await db.select().from(notificationsTable)
    .where(and(...conditions))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications.map(n => ({
    id: n.id,
    userId: n.userId,
    text: n.text,
    isRead: n.isRead,
    loadId: n.loadId,
    kind: n.kind,
    createdAt: n.createdAt,
  })));
});

router.patch("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const { isRead } = req.body;
  const [updated] = await db.update(notificationsTable)
    .set({ isRead })
    .where(and(eq(notificationsTable.id, req.params.id), eq(notificationsTable.userId, req.userId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ id: updated.id, userId: updated.userId, text: updated.text, isRead: updated.isRead, loadId: updated.loadId, createdAt: updated.createdAt });
});

router.patch("/read-all", requireAuth, async (req: AuthRequest, res) => {
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.userId!));
  res.json({ ok: true });
});

export default router;
