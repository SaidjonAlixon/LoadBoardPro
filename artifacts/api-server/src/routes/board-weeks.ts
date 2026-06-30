import { Router } from "express";
import {
  db,
  boardWeeksTable,
  loadsTable,
  editPermissionRequestsTable,
  weekEditGrantsTable,
  notificationsTable,
} from "@workspace/db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import {
  addDays,
  getThisWeekStart,
  mergeWeekBuckets,
  normalizeWeekStart,
} from "../lib/week-calendar";
import { isLoadsSpreadsheetLoad } from "../lib/load-board-scope";
import { loadsSpreadsheetCompleteOnlyFilter } from "../lib/load-visibility";
import { applyDueScheduledLocks } from "../lib/week-lock-access";

const router = Router();

async function ensureCurrentWeekRegistered(): Promise<void> {
  const thisWeek = getThisWeekStart();
  await db
    .insert(boardWeeksTable)
    .values({ id: crypto.randomUUID(), weekStart: thisWeek, createdBy: null })
    .onConflictDoNothing();
}

async function ensureWeeksRegistered(weekStarts: string[]): Promise<void> {
  const unique = [...new Set(weekStarts.map((ws) => normalizeWeekStart(ws)).filter(Boolean))];
  for (const ws of unique) {
    await db
      .insert(boardWeeksTable)
      .values({ id: crypto.randomUUID(), weekStart: ws, createdBy: null })
      .onConflictDoNothing();
  }
}

async function findBoardWeekRow(weekStart: string) {
  const mon = normalizeWeekStart(weekStart);
  const direct = await db.query.boardWeeksTable.findFirst({
    where: eq(boardWeeksTable.weekStart, mon),
  });
  if (direct) return direct;

  const rows = await db.select().from(boardWeeksTable);
  return rows.find((row) => normalizeWeekStart(String(row.weekStart)) === mon) ?? null;
}

async function findLoadIdsForWeek(weekStart: string): Promise<string[]> {
  const mon = normalizeWeekStart(weekStart);
  const direct = await db
    .select({ id: loadsTable.id, weekStart: loadsTable.weekStart })
    .from(loadsTable)
    .where(eq(loadsTable.weekStart, mon));
  if (direct.length > 0) {
    return direct.map((row) => row.id);
  }

  const rows = await db
    .select({ id: loadsTable.id, weekStart: loadsTable.weekStart })
    .from(loadsTable);
  return rows
    .filter((row) => normalizeWeekStart(String(row.weekStart)) === mon)
    .map((row) => row.id);
}

// GET /api/board-weeks — all shared weeks (same list for every dispatcher)
router.get("/", requireAuth, async (_req, res) => {
  await applyDueScheduledLocks();
  await ensureCurrentWeekRegistered();

  const counts = await db
    .select({
      weekStart: loadsTable.weekStart,
      loadCount: sql<number>`count(*)::int`,
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
    })
    .from(loadsTable)
    .where(and(
      eq(loadsTable.isDeleted, false),
      isLoadsSpreadsheetLoad(),
      loadsSpreadsheetCompleteOnlyFilter(),
    ))
    .groupBy(loadsTable.weekStart);

  await ensureWeeksRegistered(counts.map((c) => c.weekStart));

  const boardWeeks = await db
    .select()
    .from(boardWeeksTable)
    .orderBy(desc(boardWeeksTable.weekStart));

  const merged = mergeWeekBuckets([
    ...boardWeeks.map((b) => ({
      weekStart: b.weekStart,
      loadCount: 0,
      totalGross: 0,
    })),
    ...counts.map((c) => ({
      weekStart: c.weekStart,
      loadCount: Number(c.loadCount ?? 0),
      totalGross: Number(c.totalGross ?? 0),
    })),
  ]);

  const lockByWeek = Object.fromEntries(
    boardWeeks.map((b) => [
      normalizeWeekStart(b.weekStart),
      {
        isLocked: b.isLocked ?? false,
        scheduledLockAt: b.scheduledLockAt?.toISOString() ?? null,
        lockedAt: b.lockedAt?.toISOString() ?? null,
      },
    ]),
  );

  res.json(
    merged.map((w) => {
      const mon = normalizeWeekStart(w.weekStart);
      const lock = lockByWeek[mon];
      return {
        weekStart: mon,
        weekEnd: w.weekEnd,
        loadCount: w.loadCount,
        totalGross: w.totalGross,
        isLocked: lock?.isLocked ?? false,
        scheduledLockAt: lock?.scheduledLockAt ?? null,
        lockedAt: lock?.lockedAt ?? null,
      };
    }),
  );
});

// POST /api/board-weeks — open the next calendar week for everyone
router.post("/", requireAuth, requireRole("admin", "dispatcher", "accounting"), async (req: AuthRequest, res) => {
  await ensureCurrentWeekRegistered();

  const existing = await db
    .select({ weekStart: boardWeeksTable.weekStart })
    .from(boardWeeksTable);

  const starts = existing.map((w) => normalizeWeekStart(w.weekStart)).sort();
  const latest = starts[starts.length - 1] ?? getThisWeekStart();
  const nextWeek = addDays(normalizeWeekStart(latest), 7);

  const duplicate = starts.includes(nextWeek);
  if (duplicate) {
    res.status(409).json({ error: "Week already exists", weekStart: nextWeek });
    return;
  }

  const [row] = await db
    .insert(boardWeeksTable)
    .values({
      id: crypto.randomUUID(),
      weekStart: nextWeek,
      createdBy: req.userId ?? null,
    })
    .returning();

  res.status(201).json({ weekStart: row.weekStart });
});

// DELETE /api/board-weeks/:weekStart — permanently remove a week and all its data (admin only)
router.delete("/:weekStart", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const mon = normalizeWeekStart(decodeURIComponent(req.params.weekStart));

    const [boardWeek, loadIds, weekCountRow] = await Promise.all([
      findBoardWeekRow(mon),
      findLoadIdsForWeek(mon),
      db.select({ count: sql<number>`count(*)::int` }).from(boardWeeksTable),
    ]);

    const weekCount = weekCountRow[0]?.count ?? 0;

    if (!boardWeek && loadIds.length === 0) {
      res.status(404).json({ error: "Week not found" });
      return;
    }

    if (boardWeek && weekCount <= 1) {
      res.status(400).json({ error: "Cannot delete the last week" });
      return;
    }

    await db.transaction(async (tx) => {
      if (loadIds.length > 0) {
        await tx.delete(editPermissionRequestsTable).where(
          inArray(editPermissionRequestsTable.loadId, loadIds),
        );
        await tx.delete(notificationsTable).where(
          inArray(notificationsTable.loadId, loadIds),
        );
        await tx.delete(loadsTable).where(inArray(loadsTable.id, loadIds));
      }
      await tx.delete(editPermissionRequestsTable).where(
        eq(editPermissionRequestsTable.weekStart, mon),
      );
      await tx.delete(weekEditGrantsTable).where(eq(weekEditGrantsTable.weekStart, mon));
      if (boardWeek) {
        await tx.delete(boardWeeksTable).where(eq(boardWeeksTable.id, boardWeek.id));
      }
    });

    req.log?.info?.(
      { weekStart: mon, deletedLoads: loadIds.length, userId: req.userId },
      "Board week deleted",
    );
    res.json({ weekStart: mon, deletedLoads: loadIds.length });
  } catch (err) {
    req.log?.error?.({ err }, "Delete board week failed");
    res.status(500).json({ error: "Failed to delete week" });
  }
});

export default router;
