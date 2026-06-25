import { Router } from "express";
import { db, boardWeeksTable, loadsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import {
  addDays,
  getThisWeekStart,
  mergeWeekBuckets,
  normalizeWeekStart,
} from "../lib/week-calendar";

const router = Router();

async function ensureCurrentWeekRegistered(): Promise<void> {
  const thisWeek = getThisWeekStart();
  await db
    .insert(boardWeeksTable)
    .values({ id: crypto.randomUUID(), weekStart: thisWeek, createdBy: null })
    .onConflictDoNothing();
}

// GET /api/board-weeks — all shared weeks (same list for every dispatcher)
router.get("/", requireAuth, async (_req, res) => {
  await ensureCurrentWeekRegistered();

  const boardWeeks = await db
    .select()
    .from(boardWeeksTable)
    .orderBy(desc(boardWeeksTable.weekStart));

  const counts = await db
    .select({
      weekStart: loadsTable.weekStart,
      loadCount: sql<number>`count(*)::int`,
      totalGross: sql<number>`coalesce(sum(${loadsTable.rate}::numeric + ${loadsTable.reimbursement}::numeric), 0)`,
    })
    .from(loadsTable)
    .where(eq(loadsTable.isDeleted, false))
    .groupBy(loadsTable.weekStart);

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
        ...w,
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

export default router;
