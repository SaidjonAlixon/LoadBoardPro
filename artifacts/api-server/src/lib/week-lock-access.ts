import {
  db,
  boardWeeksTable,
  weekEditGrantsTable,
  weekLockSettingsTable,
  editPermissionRequestsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { and, eq, gt, desc } from "drizzle-orm";
import type { Response } from "express";
import { normalizeWeekStart, addDays, getThisWeekStart, todayIsoLocal } from "./week-calendar";

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

export async function scheduleWeekLock(weekStart: string, scheduledLockAt: Date): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  await ensureBoardWeekRow(mon);
  await db
    .update(boardWeeksTable)
    .set({ scheduledLockAt })
    .where(eq(boardWeeksTable.weekStart, mon));
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

export async function grantWeekEditAccess(
  weekStart: string,
  userIds: string[],
  grantedBy: string,
  durationHours: number,
  note?: string,
): Promise<void> {
  const mon = normalizeWeekStart(weekStart);
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  for (const userId of userIds) {
    await db.insert(weekEditGrantsTable).values({
      id: crypto.randomUUID(),
      weekStart: mon,
      userId,
      grantedBy,
      expiresAt,
      note: note ?? null,
    });
    await db.insert(notificationsTable).values({
      id: crypto.randomUUID(),
      userId,
      text: `You may edit loads for week ${mon} until ${expiresAt.toLocaleString()}. Make changes before access expires.`,
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

export async function processScheduledAndRolloverLocks(): Promise<void> {
  const now = new Date();
  const settings = await getOrCreateLockSettings();

  const rows = await db.select().from(boardWeeksTable).where(eq(boardWeeksTable.isLocked, false));

  for (const row of rows) {
    if (row.scheduledLockAt && row.scheduledLockAt <= now) {
      await lockWeek(row.weekStart, null);
    }
  }

  if (!settings.autoLockOnWeekRollover) return;

  const today = todayIsoLocal();
  const thisMonday = getThisWeekStart();
  if (today !== thisMonday) return;

  const hour = now.getHours();
  const minute = now.getMinutes();
  if (hour !== 0 || minute > 10) return;

  const lastRun = settings.lastRolloverLockAt;
  if (lastRun && toSameLocalDay(lastRun, now)) return;

  const prevWeek = addDays(thisMonday, -7);
  await lockWeek(prevWeek, null);

  await db
    .update(weekLockSettingsTable)
    .set({ lastRolloverLockAt: now })
    .where(eq(weekLockSettingsTable.id, "default"));
}

function toSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

export async function listPendingRequests() {
  return db
    .select()
    .from(editPermissionRequestsTable)
    .where(eq(editPermissionRequestsTable.status, "pending"))
    .orderBy(desc(editPermissionRequestsTable.createdAt));
}
