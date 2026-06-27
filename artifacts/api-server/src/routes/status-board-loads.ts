import { Router } from "express";
import { db, loadsTable, statusBoardLoadOverridesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import {
  STATUS_BOARD_OVERRIDE_FIELDS,
  type StatusBoardOverridePatch,
} from "../lib/status-board-load-overrides";

const router = Router();

function buildOverridePatch(body: Record<string, unknown>): StatusBoardOverridePatch {
  const patch: StatusBoardOverridePatch = {};
  for (const key of STATUS_BOARD_OVERRIDE_FIELDS) {
    if (body[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = body[key];
    }
  }
  return patch;
}

// PATCH /api/status-board/loads/:id — overlay edits for Loads spreadsheet rows
router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "dispatcher", "accounting"),
  async (req: AuthRequest, res) => {
    const load = await db.query.loadsTable.findFirst({
      where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)),
    });
    if (!load) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (load.statusBoardOnly) {
      res.status(400).json({ error: "Use /api/loads for status-board-only rows" });
      return;
    }

    const patch = buildOverridePatch(req.body);
    if (!Object.keys(patch).length) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const existing = await db.query.statusBoardLoadOverridesTable.findFirst({
      where: eq(statusBoardLoadOverridesTable.loadId, load.id),
    });

    const merged = {
      loadId: load.id,
      hiddenFromBoard: false,
      loadNumber: patch.loadNumber ?? existing?.loadNumber ?? null,
      originCity: patch.originCity ?? existing?.originCity ?? null,
      originState: patch.originState ?? existing?.originState ?? null,
      destCity: patch.destCity ?? existing?.destCity ?? null,
      destState: patch.destState ?? existing?.destState ?? null,
      puDate: patch.puDate ?? existing?.puDate ?? null,
      delDate: patch.delDate ?? existing?.delDate ?? null,
      puScheduledAt:
        patch.puScheduledAt !== undefined
          ? patch.puScheduledAt
            ? new Date(patch.puScheduledAt)
            : null
          : (existing?.puScheduledAt ?? null),
      delScheduledAt:
        patch.delScheduledAt !== undefined
          ? patch.delScheduledAt
            ? new Date(patch.delScheduledAt)
            : null
          : (existing?.delScheduledAt ?? null),
      dispatchNotes: patch.dispatchNotes ?? existing?.dispatchNotes ?? null,
    };

    if (existing) {
      await db
        .update(statusBoardLoadOverridesTable)
        .set(merged)
        .where(eq(statusBoardLoadOverridesTable.loadId, load.id));
    } else {
      await db.insert(statusBoardLoadOverridesTable).values(merged);
    }

    const saved = await db.query.statusBoardLoadOverridesTable.findFirst({
      where: eq(statusBoardLoadOverridesTable.loadId, load.id),
    });

    res.json({
      loadId: load.id,
      override: saved,
    });
  },
);

// DELETE /api/status-board/loads/:id — hide from status board only (Loads unchanged)
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin", "dispatcher", "accounting"),
  async (req: AuthRequest, res) => {
    const load = await db.query.loadsTable.findFirst({
      where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)),
    });
    if (!load) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (load.statusBoardOnly) {
      res.status(400).json({ error: "Use /api/loads to delete status-board-only rows" });
      return;
    }

    const existing = await db.query.statusBoardLoadOverridesTable.findFirst({
      where: eq(statusBoardLoadOverridesTable.loadId, load.id),
    });

    if (existing) {
      await db
        .update(statusBoardLoadOverridesTable)
        .set({ hiddenFromBoard: true })
        .where(eq(statusBoardLoadOverridesTable.loadId, load.id));
    } else {
      await db.insert(statusBoardLoadOverridesTable).values({
        loadId: load.id,
        hiddenFromBoard: true,
      });
    }

    res.status(204).send();
  },
);

export default router;
