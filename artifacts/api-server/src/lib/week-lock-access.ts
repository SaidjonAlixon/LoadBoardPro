import {
  db,
  boardWeeksTable,
  weekEditGrantsTable,
  weekLockSettingsTable,
  editPermissionRequestsTable,
  usersTable,
  notificationsTable,
  loadsTable,
  driversTable,
  brokersTable,
} from "@workspace/db";
import { and, eq, gt, desc } from "drizzle-orm";
import type { Response } from "express";
import { normalizeWeekStart, addDays, getThisWeekStart, todayIsoLocal, getEtParts, isSameEtDay, formatInEt } from "./week-calendar";

export type WeekLockInfo = {
  isLocked: boolean;
  scheduledLockAt: string | null;
  lockedAt: string | null;
};

export async function ensureBoardWeekRow(weekStart: string) {
  const mon = normalizeWeekStart(weekStart);
  await db
    .insert(boardWeeksTable)
    .values({ id: crypto.randomUUID(), weekStart: mon, createdBy: null })
    .onConflictDoNothing();
  return db.query.boardWeeksTable.findFirst({
    where: eq(boardWeeksTable.weekStart, mon),
  });
}

export async function getWeekLockInfo(weekStart: string): Promise<WeekLockInfo> {
  await applyDueScheduledLocks();
  const row = await ensureBoardWeekRow(weekStart);
  return {
    isLocked: row?.isLocked ?? false,
    scheduledLockAt: row?.scheduledLockAt?.toISOString() ?? null,
    lockedAt: row?.lockedAt?.toISOString() ?? null,
  };
}

export async function hasActiveWeekGrant(weekStart: string, userId: string): Promise<boolean> {
  const mon = normalizeWeekStart(weekStart);
  const now = new Date();
  const grant = await db.query.weekEditGrantsTable.findFirst({
    where: and(
      eq(weekEditGrantsTable.weekStart, mon),
      eq(weekEditGrantsTable.userId, userId),
      gt(weekEditGrantsTable.expiresAt, now),
    ),
  });
  return !!grant;
}

export async function getActiveGrantExpiry(
  weekStart: string,
  userId: string,
): Promise<string | null> {
  const mon = normalizeWeekStart(weekStart);
  const now = new Date();
  const grant = await db.query.weekEditGrantsTable.findFirst({
    where: and(
      eq(weekEditGrantsTable.weekStart, mon),
      eq(weekEditGrantsTable.userId, userId),
      gt(weekEditGrantsTable.expiresAt, now),
    ),
  });
  return grant?.expiresAt?.toISOString() ?? null;
}

export async function canUserEditWeek(
  weekStart: string,
  userId: string | undefined,
  role: string | undefined,
): Promise<boolean> {
  if (!role || role === "admin" || role === "accounting") return true;
  if (role !== "dispatcher" || !userId) return false;
  const { isLocked } = await getWeekLockInfo(weekStart);
  if (!isLocked) return true;
  return hasActiveWeekGrant(weekStart, userId);
}

export async function denyIfDispatcherLockedWeek(
  weekStart: string,
  userId: string | undefined,
  role: string | undefined,
  res: Response,
): Promise<boolean> {
  if (await canUserEditWeek(weekStart, userId, role)) return false;
  res.status(403).json({
    error: "This week is locked. Request permission from accounting to make changes.",
    code: "WEEK_LOCKED",
  });
  return true;
}

export async function lockWeek(weekStart: string, lockedBy: string | null): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  await revokeAllWeekGrants(mon);
  await ensureBoardWeekRow(mon);
  await db
    .update(boardWeeksTable)
    .set({
      isLocked: true,
      lockedAt: new Date(),
      lockedBy,
      scheduledLockAt: null,
    })
    .where(eq(boardWeeksTable.weekStart, mon));
}

export async function unlockWeek(weekStart: string): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  await revokeAllWeekGrants(mon);
  await ensureBoardWeekRow(mon);
  await db
    .update(boardWeeksTable)
    .set({
      isLocked: false,
      lockedAt: null,
      lockedBy: null,
      scheduledLockAt: null,
    })
    .where(eq(boardWeeksTable.weekStart, mon));
}

export async function scheduleWeekLock(
  weekStart: string,
  scheduledLockAt: Date,
  lockedBy: string | null = null,
): Promise<WeekLockInfo> {
  const mon = normalizeWeekStart(weekStart);
  await ensureBoardWeekRow(mon);
  if (scheduledLockAt.getTime() <= Date.now()) {
    await lockWeek(mon, lockedBy);
  } else {
    await db
      .update(boardWeeksTable)
      .set({ scheduledLockAt })
      .where(eq(boardWeeksTable.weekStart, mon));
  }
  return getWeekLockInfo(mon);
}

export async function clearWeekSchedule(weekStart: string): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  await db
    .update(boardWeeksTable)
    .set({ scheduledLockAt: null })
    .where(eq(boardWeeksTable.weekStart, mon));
}

export async function getOrCreateLockSettings() {
  let row = await db.query.weekLockSettingsTable.findFirst({
    where: eq(weekLockSettingsTable.id, "default"),
  });
  if (!row) {
    [row] = await db
      .insert(weekLockSettingsTable)
      .values({ id: "default" })
      .returning();
  }
  return row!;
}

export type GrantDurationOptions = {
  durationMinutes?: number;
  durationHours?: number;
  note?: string;
};

function resolveGrantMinutes(options: GrantDurationOptions): number {
  if (typeof options.durationMinutes === "number" && options.durationMinutes >= 1) {
    return Math.min(Math.floor(options.durationMinutes), 24 * 60);
  }
  const hours = options.durationHours ?? 1;
  return Math.min(Math.max(Math.floor(hours * 60), 1), 24 * 60);
}

function formatGrantExpiry(expiresAt: Date): string {
  return formatInEt(expiresAt, "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function revokeAllWeekGrants(weekStart: string): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  const now = new Date();
  const active = await db
    .select()
    .from(weekEditGrantsTable)
    .where(eq(weekEditGrantsTable.weekStart, mon));
  if (!active.length) return;

  await db.delete(weekEditGrantsTable).where(eq(weekEditGrantsTable.weekStart, mon));

  for (const grant of active) {
    if (grant.expiresAt <= now) continue;
    await db.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId: grant.userId,
      text: `Edit access for week ${mon} was revoked.`,
      kind: "week_edit_revoked",
    });
  }
}

export async function revokeWeekEditGrant(grantId: string): Promise<boolean> {
  const grant = await db.query.weekEditGrantsTable.findFirst({
    where: eq(weekEditGrantsTable.id, grantId),
  });
  if (!grant) return false;

  await db.delete(weekEditGrantsTable).where(eq(weekEditGrantsTable.id, grantId));

  if (grant.expiresAt > new Date()) {
    try {
      await db.insert(notificationsTable).values({
        id: crypto.randomUUID(),
        userId: grant.userId,
        text: `Edit access for week ${grant.weekStart} was revoked.`,
        kind: "week_edit_revoked",
      });
    } catch {
      /* notification is best-effort */
    }
  }
  return true;
}

export async function grantWeekEditAccess(
  weekStart: string,
  userIds: string[],
  grantedBy: string,
  options: GrantDurationOptions,
): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  const minutes = resolveGrantMinutes(options);
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  const expiryLabel = formatGrantExpiry(expiresAt);

  for (const userId of userIds) {
    await db
      .delete(weekEditGrantsTable)
      .where(and(eq(weekEditGrantsTable.weekStart, mon), eq(weekEditGrantsTable.userId, userId)));

    await db.insert(weekEditGrantsTable).values({
      id: crypto.randomUUID(),
      weekStart: mon,
      userId,
      grantedBy,
      expiresAt,
      note: options.note ?? null,
    });
    await db.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId,
      text: `You may edit loads for week ${mon} for ${minutes} minute(s) — until ${expiryLabel} ET.`,
      kind: "week_edit_granted",
    });
  }
}

export async function notifyAccountants(text: string, loadId?: string) {
  const accountants = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.role, "accounting"), eq(usersTable.isActive, true)));
  const admins = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true)));
  const recipients = [...accountants, ...admins];
  const seen = new Set<string>();
  for (const u of recipients) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    await db.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId: u.id,
      text,
      loadId: loadId ?? null,
      kind: "edit_request",
    });
  }
}

export async function applyDueScheduledLocks(): Promise<void> {
  const now = new Date();
  const rows = await db.select().from(boardWeeksTable).where(eq(boardWeeksTable.isLocked, false));

  for (const row of rows) {
    if (row.scheduledLockAt && row.scheduledLockAt <= now) {
      await lockWeek(row.weekStart, null);
    }
  }
}

export async function processScheduledAndRolloverLocks(): Promise<void> {
  await applyDueScheduledLocks();

  const now = new Date();
  const settings = await getOrCreateLockSettings();

  if (!settings.autoLockOnWeekRollover) return;

  const today = todayIsoLocal();
  const thisMonday = getThisWeekStart();
  if (today !== thisMonday) return;

  const et = getEtParts(now);
  if (et.hour !== 0 || et.minute > 10) return;

  const lastRun = settings.lastRolloverLockAt;
  if (lastRun && isSameEtDay(lastRun, now)) return;

  const prevWeek = addDays(thisMonday, -7);
  await lockWeek(prevWeek, null);

  await db
    .update(weekLockSettingsTable)
    .set({ lastRolloverLockAt: now })
    .where(eq(weekLockSettingsTable.id, "default"));
}

export async function listPendingRequests() {
  const rows = await db
    .select({
      id: editPermissionRequestsTable.id,
      loadId: editPermissionRequestsTable.loadId,
      weekStart: editPermissionRequestsTable.weekStart,
      requestedBy: editPermissionRequestsTable.requestedBy,
      fieldDescription: editPermissionRequestsTable.fieldDescription,
      message: editPermissionRequestsTable.message,
      status: editPermissionRequestsTable.status,
      reviewedBy: editPermissionRequestsTable.reviewedBy,
      reviewedAt: editPermissionRequestsTable.reviewedAt,
      grantDurationHours: editPermissionRequestsTable.grantDurationHours,
      createdAt: editPermissionRequestsTable.createdAt,
      requesterName: usersTable.name,
      requesterNickname: usersTable.nickname,
      requesterEmail: usersTable.email,
      loadNumber: loadsTable.loadNumber,
      originCity: loadsTable.originCity,
      destCity: loadsTable.destCity,
      driverName: driversTable.fullName,
      brokerName: brokersTable.name,
      loadStatus: loadsTable.status,
    })
    .from(editPermissionRequestsTable)
    .innerJoin(usersTable, eq(editPermissionRequestsTable.requestedBy, usersTable.id))
    .leftJoin(loadsTable, eq(editPermissionRequestsTable.loadId, loadsTable.id))
    .leftJoin(driversTable, eq(loadsTable.driverId, driversTable.id))
    .leftJoin(brokersTable, eq(loadsTable.brokerId, brokersTable.id))
    .where(eq(editPermissionRequestsTable.status, "pending"))
    .orderBy(desc(editPermissionRequestsTable.createdAt));

  return rows.map((r) => {
    const name = r.requesterName?.trim() || null;
    const nickname = r.requesterNickname?.trim() || null;
    return {
      ...r,
      requesterName: name,
      requesterNickname: nickname,
      requesterEmail: r.requesterEmail ?? null,
      loadNumber: r.loadNumber ?? null,
      originCity: r.originCity ?? null,
      destCity: r.destCity ?? null,
      driverName: r.driverName ?? null,
      brokerName: r.brokerName ?? null,
      loadStatus: r.loadStatus ?? null,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    };
  });
}
