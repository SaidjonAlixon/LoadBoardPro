import { Router } from "express";
import {
  db,
  editPermissionRequestsTable,
  weekEditGrantsTable,
  weekLockSettingsTable,
  usersTable,
  loadsTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, gt, desc } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import { normalizeWeekStart } from "../lib/week-calendar";
import {
  getWeekLockInfo,
  lockWeek,
  unlockWeek,
  scheduleWeekLock,
  clearWeekSchedule,
  getOrCreateLockSettings,
  grantWeekEditAccess,
  notifyAccountants,
  canUserEditWeek,
  getActiveGrantExpiry,
  listPendingRequests,
  revokeWeekEditGrant,
} from "../lib/week-lock-access";

const router = Router();

// GET /api/week-locks/access?weekStart=
router.get("/access", requireAuth, async (req: AuthRequest, res) => {
  const weekStart = String(req.query.weekStart ?? "");
  if (!weekStart) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  const info = await getWeekLockInfo(mon);
  const canEdit = await canUserEditWeek(mon, req.userId, req.userRole);
  const grantExpiresAt =
    req.userId && req.userRole === "dispatcher"
      ? await getActiveGrantExpiry(mon, req.userId)
      : null;
  res.json({ weekStart: mon, ...info, canEdit, grantExpiresAt });
});

// GET /api/week-locks/settings
router.get("/settings", requireAuth, requireRole("admin", "accounting"), async (_req, res) => {
  const settings = await getOrCreateLockSettings();
  res.json({
    autoLockOnWeekRollover: settings.autoLockOnWeekRollover,
    lastRolloverLockAt: settings.lastRolloverLockAt?.toISOString() ?? null,
  });
});

// PATCH /api/week-locks/settings
router.patch("/settings", requireAuth, requireRole("admin", "accounting"), async (req: AuthRequest, res) => {
  const { autoLockOnWeekRollover } = req.body as { autoLockOnWeekRollover?: boolean };
  if (typeof autoLockOnWeekRollover !== "boolean") {
    res.status(400).json({ error: "autoLockOnWeekRollover boolean required" });
    return;
  }
  const settings = await getOrCreateLockSettings();
  await db
    .update(weekLockSettingsTable)
    .set({
      autoLockOnWeekRollover,
      updatedBy: req.userId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(weekLockSettingsTable.id, settings.id));
  res.json({ autoLockOnWeekRollover });
});

// POST /api/week-locks/lock
router.post("/lock", requireAuth, requireRole("admin", "accounting"), async (req: AuthRequest, res) => {
  const { weekStart } = req.body as { weekStart?: string };
  if (!weekStart) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  await lockWeek(mon, req.userId ?? null);
  res.json({ weekStart: mon, isLocked: true });
});

// POST /api/week-locks/unlock
router.post("/unlock", requireAuth, requireRole("admin", "accounting"), async (req: AuthRequest, res) => {
  const { weekStart } = req.body as { weekStart?: string };
  if (!weekStart) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  await unlockWeek(mon);
  res.json({ weekStart: mon, isLocked: false });
});

// POST /api/week-locks/schedule
router.post("/schedule", requireAuth, requireRole("admin", "accounting"), async (req: AuthRequest, res) => {
  const { weekStart, scheduledLockAt } = req.body as {
    weekStart?: string;
    scheduledLockAt?: string;
  };
  if (!weekStart || !scheduledLockAt) {
    res.status(400).json({ error: "weekStart and scheduledLockAt required" });
    return;
  }
  const at = new Date(scheduledLockAt);
  if (Number.isNaN(at.getTime())) {
    res.status(400).json({ error: "Invalid scheduledLockAt" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  const info = await scheduleWeekLock(mon, at, req.userId ?? null);
  res.json({ weekStart: mon, ...info });
});

// DELETE /api/week-locks/schedule?weekStart=
router.delete("/schedule", requireAuth, requireRole("admin", "accounting"), async (req, res) => {
  const weekStart = String(req.query.weekStart ?? "");
  if (!weekStart) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  await clearWeekSchedule(mon);
  res.json({ weekStart: mon, scheduledLockAt: null });
});

// GET /api/week-locks/grants?weekStart=
router.get("/grants", requireAuth, requireRole("admin", "accounting"), async (req, res) => {
  const weekStart = String(req.query.weekStart ?? "");
  if (!weekStart) {
    res.status(400).json({ error: "weekStart required" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  const now = new Date();
  const grants = await db
    .select({
      id: weekEditGrantsTable.id,
      weekStart: weekEditGrantsTable.weekStart,
      userId: weekEditGrantsTable.userId,
      grantedBy: weekEditGrantsTable.grantedBy,
      expiresAt: weekEditGrantsTable.expiresAt,
      note: weekEditGrantsTable.note,
      createdAt: weekEditGrantsTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(weekEditGrantsTable)
    .innerJoin(usersTable, eq(weekEditGrantsTable.userId, usersTable.id))
    .where(and(eq(weekEditGrantsTable.weekStart, mon), gt(weekEditGrantsTable.expiresAt, now)))
    .orderBy(desc(weekEditGrantsTable.expiresAt));
  res.json(
    grants.map((g) => ({
      ...g,
      userName: g.userName ?? g.userEmail ?? g.userId,
      expiresAt: g.expiresAt.toISOString(),
      createdAt: g.createdAt.toISOString(),
    })),
  );
});

// POST /api/week-locks/grants/revoke
router.post("/grants/revoke", requireAuth, requireRole("admin", "accounting"), async (req, res) => {
  const { grantId } = req.body as { grantId?: string };
  if (!grantId) {
    res.status(400).json({ error: "grantId required" });
    return;
  }
  try {
    const ok = await revokeWeekEditGrant(grantId);
    if (!ok) {
      res.status(404).json({ error: "Grant not found" });
      return;
    }
    res.json({ revoked: true });
  } catch (err) {
    req.log?.error({ err }, "Failed to revoke week edit grant");
    res.status(500).json({ error: "Failed to revoke grant" });
  }
});

// POST /api/week-locks/grants
router.post("/grants", requireAuth, requireRole("admin", "accounting"), async (req: AuthRequest, res) => {
  const { weekStart, userIds, durationHours, durationMinutes, note } = req.body as {
    weekStart?: string;
    userIds?: string[];
    durationHours?: number;
    durationMinutes?: number;
    note?: string;
  };
  if (!weekStart || !Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: "weekStart and userIds required" });
    return;
  }
  if (
    typeof durationMinutes !== "number"
    && typeof durationHours !== "number"
  ) {
    res.status(400).json({ error: "durationMinutes or durationHours required" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  await grantWeekEditAccess(mon, userIds, req.userId!, { durationHours, durationMinutes, note });
  res.status(201).json({ granted: userIds.length, durationMinutes: durationMinutes ?? (durationHours ?? 1) * 60 });
});

// DELETE /api/week-locks/grants/:id
router.delete("/grants/:id", requireAuth, requireRole("admin", "accounting"), async (req, res) => {
  try {
    const ok = await revokeWeekEditGrant(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "Grant not found" });
      return;
    }
    res.json({ revoked: true });
  } catch (err) {
    req.log?.error({ err }, "Failed to revoke week edit grant");
    res.status(500).json({ error: "Failed to revoke grant" });
  }
});

// POST /api/week-locks/requests
router.post("/requests", requireAuth, requireRole("dispatcher"), async (req: AuthRequest, res) => {
  const { loadId, weekStart, fieldDescription, message } = req.body as {
    loadId?: string;
    weekStart?: string;
    fieldDescription?: string;
    message?: string;
  };
  if (!loadId || !weekStart || !fieldDescription?.trim()) {
    res.status(400).json({ error: "loadId, weekStart, and fieldDescription required" });
    return;
  }
  const load = await db.query.loadsTable.findFirst({
    where: and(eq(loadsTable.id, loadId), eq(loadsTable.isDeleted, false)),
  });
  if (!load) {
    res.status(404).json({ error: "Load not found" });
    return;
  }
  if (load.dispatcherId !== req.userId) {
    res.status(403).json({ error: "You can only request edits for your own loads" });
    return;
  }
  const mon = normalizeWeekStart(weekStart);
  const [row] = await db
    .insert(editPermissionRequestsTable)
    .values({
      loadId,
      weekStart: mon,
      requestedBy: req.userId!,
      fieldDescription: fieldDescription.trim(),
      message: message?.trim() ?? null,
    })
    .returning();

  const requester = await db.query.usersTable.findFirst({ where: eq(usersTable.id, req.userId!) });
  const name = requester?.name ?? requester?.email ?? "Dispatcher";
  await notifyAccountants(
    `${name} requests edit on Load #${load.loadNumber} (${fieldDescription.trim()}). ${message?.trim() ?? ""}`.trim(),
    loadId,
  );

  res.status(201).json(row);
});

// GET /api/week-locks/requests
router.get("/requests", requireAuth, requireRole("admin", "accounting"), async (_req, res) => {
  const rows = await listPendingRequests();
  res.json(rows);
});

// POST /api/week-locks/requests/:id/approve
router.post(
  "/requests/:id/approve",
  requireAuth,
  requireRole("admin", "accounting"),
  async (req: AuthRequest, res) => {
    const { grantDurationHours, grantDurationMinutes } = req.body as {
      grantDurationHours?: number;
      grantDurationMinutes?: number;
    };
    const minutes =
      typeof grantDurationMinutes === "number" && grantDurationMinutes >= 1
        ? Math.min(Math.floor(grantDurationMinutes), 24 * 60)
        : (grantDurationHours === 3 ? 3 : 1) * 60;
    const request = await db.query.editPermissionRequestsTable.findFirst({
      where: eq(editPermissionRequestsTable.id, req.params.id),
    });
    if (!request || request.status !== "pending") {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    await db
      .update(editPermissionRequestsTable)
      .set({
        status: "approved",
        reviewedBy: req.userId ?? null,
        reviewedAt: new Date(),
        grantDurationHours: Math.ceil(minutes / 60),
      })
      .where(eq(editPermissionRequestsTable.id, request.id));

    await grantWeekEditAccess(
      request.weekStart,
      [request.requestedBy],
      req.userId!,
      {
        durationMinutes: minutes,
        note: `Approved edit request for load ${request.loadId}`,
      },
    );

    const load = await db.query.loadsTable.findFirst({ where: eq(loadsTable.id, request.loadId) });
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    await db.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId: request.requestedBy,
      text: `Edit permission granted for week ${request.weekStart}. You have ${minutes} minute(s) until ${expiresAt.toLocaleString()} to update Load #${load?.loadNumber ?? request.loadId} (${request.fieldDescription}).`,
      loadId: request.loadId,
      kind: "edit_request_approved",
    });

    res.json({ status: "approved", grantDurationMinutes: minutes });
  },
);

// POST /api/week-locks/requests/:id/deny
router.post(
  "/requests/:id/deny",
  requireAuth,
  requireRole("admin", "accounting"),
  async (req: AuthRequest, res) => {
    const request = await db.query.editPermissionRequestsTable.findFirst({
      where: eq(editPermissionRequestsTable.id, req.params.id),
    });
    if (!request || request.status !== "pending") {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    await db
      .update(editPermissionRequestsTable)
      .set({
        status: "denied",
        reviewedBy: req.userId ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(editPermissionRequestsTable.id, request.id));

    await db.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId: request.requestedBy,
      text: `Your edit request for week ${request.weekStart} was denied.`,
      loadId: request.loadId,
      kind: "edit_request_denied",
    });

    res.json({ status: "denied" });
  },
);

export default router;
