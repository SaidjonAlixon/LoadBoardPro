import { Router } from "express";
import { db, loadsTable, driversTable, usersTable, brokersTable, notificationsTable } from "@workspace/db";
import { eq, and, or, like, ilike, desc, gte, lte, sql, inArray, asc, isNull } from "drizzle-orm";
import { requireAuth, requireRole, type AuthRequest } from "../middlewares/requireAuth";
import { isLoadDispatcherLocked } from "../lib/load-statuses";
import { getMondayOfWeek, normalizeWeekStart, todayIsoLocal, weekEndFromStart, computeLoadWeekMoveDates } from "../lib/week-calendar";
import { applyWeekPeriodFilters } from "../lib/period-filters";
import {
  isDraftLoadNumberValue,
  validateDispatcherLoadInput,
  validateAdminLoadInput,
  mergeLoadForValidation,
  isLoadDraftInProgress,
} from "../lib/validate-load";
import { denyIfDispatcherLockedWeek } from "../lib/week-lock-access";
import {
  isLoadsSpreadsheetLoad,
  enforceLoadBoardPatchScope,
  LOAD_BOARD_SCOPE_HEADER,
} from "../lib/load-board-scope";
import { loadsSpreadsheetVisibilityFilter, filterDbLoadsForViewer } from "../lib/load-visibility";

const router = Router();

function sortLoadsBySortOrder<T extends { sortOrder?: number | null; createdAt?: Date | string | null }>(
  loads: T[],
): T[] {
  return [...loads].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

function computeDiffs(load: typeof loadsTable.$inferSelect) {
  const rate = Number(load.rate);
  const reimb = Number(load.reimbursement);
  const invoiced = load.invoicedAmount !== null ? Number(load.invoicedAmount) : null;
  const paid = load.brokerPaid !== null ? Number(load.brokerPaid) : null;

  const irDiff = invoiced !== null ? invoiced - (rate + reimb) : null;
  const biDiff = paid !== null && invoiced !== null ? paid - invoiced : null;
  const rpm = Number(load.mileage) > 0 ? rate / Number(load.mileage) : null;

  return { irDiff, biDiff, rpm };
}

function serializeLoad(
  l: typeof loadsTable.$inferSelect,
  extras?: {
    driver?: typeof driversTable.$inferSelect | null;
    dispatcher?: typeof usersTable.$inferSelect | null;
    broker?: typeof brokersTable.$inferSelect | null;
  }
) {
  const { irDiff, biDiff, rpm } = computeDiffs(l);
  return {
    id: l.id,
    loadNumber: l.loadNumber,
    driverId: l.driverId,
    driver: extras?.driver ? serializeDriver(extras.driver) : undefined,
    dispatcherId: l.dispatcherId,
    dispatcher: extras?.dispatcher ? serializeUser(extras.dispatcher) : undefined,
    createdById: l.createdById,
    brokerId: l.brokerId,
    broker: extras?.broker ? serializeBroker(extras.broker) : undefined,
    puDate: l.puDate,
    delDate: l.delDate,
    puScheduledAt: l.puScheduledAt?.toISOString() ?? null,
    delScheduledAt: l.delScheduledAt?.toISOString() ?? null,
    originCity: l.originCity,
    originState: l.originState,
    destCity: l.destCity,
    destState: l.destState,
    mileage: Number(l.mileage),
    rate: Number(l.rate),
    rpm,
    status: l.status,
    reimbursement: Number(l.reimbursement),
    dispatchNotes: l.dispatchNotes,
    invoicedAmount: l.invoicedAmount !== null ? Number(l.invoicedAmount) : null,
    brokerPaid: l.brokerPaid !== null ? Number(l.brokerPaid) : null,
    notes: l.notes,
    weekStart: l.weekStart,
    sortOrder: l.sortOrder,
    statusBoardOnly: l.statusBoardOnly,
    irDiff,
    biDiff,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function serializeDriver(d: typeof driversTable.$inferSelect) {
  return { id: d.id, fullName: d.fullName, driverType: d.driverType, phone: d.phone, email: d.email, truckNumber: d.truckNumber, currentLocation: d.currentLocation, isActive: d.isActive, createdAt: d.createdAt };
}
function serializeUser(u: typeof usersTable.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
}
function serializeBroker(b: typeof brokersTable.$inferSelect) {
  return { id: b.id, name: b.name, mcNumber: b.mcNumber, contact: b.contact, email: b.email, phone: b.phone, createdAt: b.createdAt };
}

// GET /api/loads
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const {
    status, driverId, dispatcherId, brokerId, weekStart, weekStarts,
    dateFrom, dateTo, search, page = "1", limit = "50"
  } = req.query as Record<string, string>;

  const conditions = [
    eq(loadsTable.isDeleted, false),
    isLoadsSpreadsheetLoad(),
    loadsSpreadsheetVisibilityFilter(req.userId, req.userRole),
  ];

  if (status) conditions.push(eq(loadsTable.status, status as any));
  if (driverId) conditions.push(eq(loadsTable.driverId, driverId));
  if (dispatcherId) conditions.push(eq(loadsTable.dispatcherId, dispatcherId));
  if (brokerId) conditions.push(eq(loadsTable.brokerId, brokerId));
  applyWeekPeriodFilters(conditions, { dateFrom, dateTo, weekStart, weekStarts });
  if (search) {
    const pattern = `%${search}%`;
    const matchingDrivers = await db
      .select({ id: driversTable.id })
      .from(driversTable)
      .where(
        or(
          ilike(driversTable.fullName, pattern),
          ilike(driversTable.truckNumber, pattern),
          ilike(driversTable.phone, pattern),
        )!,
      );
    const matchingDriverIds = matchingDrivers.map((d) => d.id);

    const searchConditions = [
      ilike(loadsTable.loadNumber, pattern),
      ilike(loadsTable.originCity, pattern),
      ilike(loadsTable.destCity, pattern),
    ];
    if (matchingDriverIds.length > 0) {
      searchConditions.push(inArray(loadsTable.driverId, matchingDriverIds));
    }

    conditions.push(or(...searchConditions)!);
  }

  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 200);
  const offset = (pageNum - 1) * limitNum;

  const [loads, countResult] = await Promise.all([
    db.select().from(loadsTable).where(and(...conditions)).orderBy(asc(loadsTable.sortOrder), asc(loadsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(loadsTable).where(and(...conditions)),
  ]);

  const total = countResult[0]?.count ?? 0;

  const visibleLoads = filterDbLoadsForViewer(loads, req.userId, req.userRole);

  // Fetch related entities
  const driverIds = [...new Set(visibleLoads.map(l => l.driverId).filter(Boolean))] as string[];
  const dispatcherIds = [...new Set(visibleLoads.map(l => l.dispatcherId).filter(Boolean))] as string[];
  const brokerIds = [...new Set(visibleLoads.map(l => l.brokerId).filter(Boolean))] as string[];

  const [drivers, dispatchers, brokers] = await Promise.all([
    driverIds.length ? db.select().from(driversTable).where(inArray(driversTable.id, driverIds)) : [],
    dispatcherIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, dispatcherIds)) : [],
    brokerIds.length ? db.select().from(brokersTable).where(inArray(brokersTable.id, brokerIds)) : [],
  ]);

  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const dispatcherMap = Object.fromEntries(dispatchers.map(d => [d.id, d]));
  const brokerMap = Object.fromEntries(brokers.map(b => [b.id, b]));

  res.json({
    data: visibleLoads.map(l => serializeLoad(l, {
      driver: l.driverId ? driverMap[l.driverId] : null,
      dispatcher: l.dispatcherId ? dispatcherMap[l.dispatcherId] : null,
      broker: l.brokerId ? brokerMap[l.brokerId] : null,
    })),
    total: visibleLoads.length < loads.length ? visibleLoads.length : total,
    page: pageNum,
    limit: limitNum,
  });
});

// POST /api/loads
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const {
    loadNumber, driverId, dispatcherId, brokerId,
    puDate, delDate, originCity, originState, destCity, destState,
    mileage, rate, status, reimbursement, dispatchNotes, notes, weekStart, statusBoardOnly,
  } = req.body;

  const driverKey = driverId ?? null;
  const driverCondition = driverKey
    ? eq(loadsTable.driverId, driverKey)
    : isNull(loadsTable.driverId);
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${loadsTable.sortOrder}), -1)` })
    .from(loadsTable)
    .where(and(eq(loadsTable.isDeleted, false), driverCondition));

  const resolvedWeekStart = getMondayOfWeek(puDate || weekStart || todayIsoLocal());

  if (
    await denyIfDispatcherLockedWeek(resolvedWeekStart, req.userId, req.userRole, res)
  ) {
    return;
  }

  const resolvedDispatcherId =
    dispatcherId
    ?? (req.userRole === "dispatcher" ? req.userId : null);

  const markStatusBoardOnly =
    statusBoardOnly === true
    && (req.userRole === "dispatcher" || req.userRole === "admin");

  const isDispatcherRole = req.userRole === "dispatcher" || req.userRole === "admin";
  if (isDispatcherRole && !isDraftLoadNumberValue(loadNumber)) {
    const payload = {
      loadNumber,
      dispatcherId: resolvedDispatcherId,
      puDate,
      delDate,
      originCity,
      originState,
      destCity,
      destState,
      mileage,
      rate,
      reimbursement,
      status: status ?? "Booked",
    };
    const errors =
      req.userRole === "admin"
        ? validateAdminLoadInput(payload)
        : validateDispatcherLoadInput(payload);
    if (errors.length > 0) {
      res.status(400).json({ error: `Required fields: ${errors.join(", ")}` });
      return;
    }
  }

  const [load] = await db.insert(loadsTable).values({
    id: crypto.randomUUID(),
    loadNumber,
    driverId: driverId ?? null,
    dispatcherId: resolvedDispatcherId,
    brokerId: brokerId ?? null,
    puDate,
    delDate,
    originCity,
    originState,
    destCity,
    destState,
    mileage: String(mileage),
    rate: String(rate),
    status: status ?? "Booked",
    reimbursement: String(reimbursement ?? 0),
    dispatchNotes: dispatchNotes ?? null,
    notes: notes ?? null,
    weekStart: resolvedWeekStart,
    sortOrder: Number(maxRow?.max ?? -1) + 1,
    statusBoardOnly: markStatusBoardOnly,
    createdById: req.userId ?? null,
  }).returning();

  res.status(201).json(serializeLoad(load));
});

// POST /api/loads/bulk-move-week — move loads to another board week (accounting/admin)
router.post("/bulk-move-week", requireAuth, requireRole("admin", "accounting"), async (req: AuthRequest, res) => {
  const { loadIds, targetWeekStart } = req.body as {
    loadIds?: string[];
    targetWeekStart?: string;
  };

  if (!Array.isArray(loadIds) || loadIds.length === 0 || !targetWeekStart) {
    res.status(400).json({ error: "loadIds and targetWeekStart required" });
    return;
  }

  const targetMonday = normalizeWeekStart(targetWeekStart);
  const uniqueIds = [...new Set(loadIds)];

  const rows = await db
    .select()
    .from(loadsTable)
    .where(and(eq(loadsTable.isDeleted, false), inArray(loadsTable.id, uniqueIds)));

  if (rows.length !== uniqueIds.length) {
    res.status(400).json({ error: "One or more loads were not found" });
    return;
  }

  try {
    for (const load of rows) {
      const dates = computeLoadWeekMoveDates(load, targetMonday);
      await db.update(loadsTable).set(dates).where(eq(loadsTable.id, load.id));
    }
    res.json({ moved: rows.length, targetWeekStart: targetMonday });
  } catch (err) {
    req.log.error({ err, loadIds: uniqueIds, targetWeekStart: targetMonday }, "Bulk move week failed");
    res.status(500).json({ error: "Failed to move loads to the selected week" });
  }
});

// POST /api/loads/reorder — reorder loads within a driver group
router.post("/reorder", requireAuth, requireRole("admin", "dispatcher", "accounting"), async (req: AuthRequest, res) => {
  const { driverId, loadIds } = req.body as { driverId?: string | null; loadIds?: string[] };

  if (!Array.isArray(loadIds) || loadIds.length === 0) {
    res.status(400).json({ error: "loadIds required" });
    return;
  }

  const normalizedDriverId = driverId ?? null;
  const rows = await db
    .select()
    .from(loadsTable)
    .where(and(eq(loadsTable.isDeleted, false), inArray(loadsTable.id, loadIds)));

  if (rows.length !== loadIds.length) {
    res.status(400).json({ error: "Invalid load ids" });
    return;
  }

  for (const row of rows) {
    if ((row.driverId ?? null) !== normalizedDriverId) {
      res.status(400).json({ error: "Loads must belong to the same driver" });
      return;
    }
  }

  const reorderWeek = rows[0]?.weekStart ?? rows[0]?.puDate ?? todayIsoLocal();
  if (
    await denyIfDispatcherLockedWeek(reorderWeek, req.userId, req.userRole, res)
  ) {
    return;
  }

  await Promise.all(
    loadIds.map((id, index) =>
      db.update(loadsTable).set({ sortOrder: index }).where(eq(loadsTable.id, id)),
    ),
  );

  res.status(204).send();
});

// GET /api/loads/:id
router.get("/:id", requireAuth, async (req, res) => {
  const load = await db.query.loadsTable.findFirst({ where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)) });
  if (!load) { res.status(404).json({ error: "Not found" }); return; }

  const [driver, dispatcher, broker] = await Promise.all([
    load.driverId ? db.query.driversTable.findFirst({ where: eq(driversTable.id, load.driverId) }) : null,
    load.dispatcherId ? db.query.usersTable.findFirst({ where: eq(usersTable.id, load.dispatcherId) }) : null,
    load.brokerId ? db.query.brokersTable.findFirst({ where: eq(brokersTable.id, load.brokerId) }) : null,
  ]);

  res.json(serializeLoad(load, { driver, dispatcher, broker }));
});

// PATCH /api/loads/:id
router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const load = await db.query.loadsTable.findFirst({ where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)) });
  if (!load) { res.status(404).json({ error: "Not found" }); return; }

  if (isLoadDispatcherLocked(load.status) && req.userRole !== "accounting") {
    res.status(403).json({ error: "Load is locked for accounting review" });
    return;
  }

  const targetWeekStart = String(
    req.body.weekStart ?? load.weekStart ?? load.puDate ?? todayIsoLocal(),
  );
  if (
    await denyIfDispatcherLockedWeek(targetWeekStart, req.userId, req.userRole, res)
  ) {
    return;
  }

  if (!enforceLoadBoardPatchScope(load, req.get(LOAD_BOARD_SCOPE_HEADER), res)) {
    return;
  }

  if ("statusBoardOnly" in req.body) {
    res.status(400).json({ error: "Cannot change load board scope" });
    return;
  }

  // Role-based field restrictions
  const isAccounting = req.userRole === "accounting";
  const isDispatcher = req.userRole === "dispatcher";
  const isAdmin = req.userRole === "admin";
  const canFullyEditLoad = isAccounting || isAdmin;

  const dispatcherFields = [
    "loadNumber", "driverId", "brokerId", "dispatcherId",
    "puDate", "delDate", "puScheduledAt", "delScheduledAt",
    "originCity", "originState", "destCity", "destState",
    "mileage", "rate", "reimbursement", "dispatchNotes", "status",
  ];
  const accountingFields = ["invoicedAmount", "brokerPaid", "notes", "status"];
  const accountingAllowed = [...new Set([...dispatcherFields, ...accountingFields, "weekStart"])];

  const allowed = canFullyEditLoad
    ? accountingAllowed
    : isDispatcher
      ? dispatcherFields
      : Object.keys(req.body);

  const updates: Record<string, unknown> = {};
  const body = req.body;

  const fieldMap: Record<string, string> = {
    loadNumber: "loadNumber",
    driverId: "driverId",
    dispatcherId: "dispatcherId",
    brokerId: "brokerId",
    puDate: "puDate",
    delDate: "delDate",
    puScheduledAt: "puScheduledAt",
    delScheduledAt: "delScheduledAt",
    originCity: "originCity",
    originState: "originState",
    destCity: "destCity",
    destState: "destState",
    mileage: "mileage",
    rate: "rate",
    status: "status",
    reimbursement: "reimbursement",
    dispatchNotes: "dispatchNotes",
    invoicedAmount: "invoicedAmount",
    brokerPaid: "brokerPaid",
    notes: "notes",
    weekStart: "weekStart",
  };

  for (const key of allowed) {
    if (key in fieldMap && body[key] !== undefined) {
      if (key === "status" && isDispatcher) {
        const dispatcherStatuses = [
          "Booked", "InQM", "Delivered", "Canceled", "Completed", "NeedRevRC", "Issue",
        ];
        if (!dispatcherStatuses.includes(body[key])) {
          res.status(403).json({ error: "Invalid status for dispatcher" });
          return;
        }
      }
      const col = fieldMap[key];
      if (["mileage", "rate", "reimbursement", "invoicedAmount", "brokerPaid"].includes(col)) {
        updates[col] = body[key] !== null ? String(body[key]) : null;
      } else if (col === "puScheduledAt" || col === "delScheduledAt") {
        updates[col] = body[key] ? new Date(body[key]) : null;
      } else {
        updates[col] = body[key];
      }
    }
  }

  const canAssignDriver = isDispatcher || isAdmin || isAccounting;
  if (
    canAssignDriver &&
    body.driverId !== undefined &&
    (body.driverId ?? null) !== (load.driverId ?? null)
  ) {
    updates.driverId = body.driverId ?? null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  if ("dispatcherId" in updates && updates.dispatcherId) {
    const nextDispatcherId = String(updates.dispatcherId);
    const target = await db.query.usersTable.findFirst({
      where: and(
        eq(usersTable.id, nextDispatcherId),
        eq(usersTable.role, "dispatcher"),
        eq(usersTable.isActive, true),
      ),
    });
    if (!target) {
      res.status(400).json({ error: "Invalid dispatcher" });
      return;
    }
  }

  if ("driverId" in updates && (updates.driverId ?? null) !== (load.driverId ?? null)) {
    const nextDriverId = (updates.driverId as string | null) ?? null;
    if (nextDriverId) {
      const driver = await db.query.driversTable.findFirst({
        where: and(
          eq(driversTable.id, nextDriverId),
          eq(driversTable.isActive, true),
          isNull(driversTable.deletedAt),
        ),
      });
      if (!driver) {
        res.status(400).json({ error: "Invalid driver" });
        return;
      }
    }
    const driverCondition = nextDriverId
      ? eq(loadsTable.driverId, nextDriverId)
      : isNull(loadsTable.driverId);
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${loadsTable.sortOrder}), -1)` })
      .from(loadsTable)
      .where(and(eq(loadsTable.isDeleted, false), driverCondition));
    updates.sortOrder = Number(maxRow?.max ?? -1) + 1;
  }

  if ("puDate" in updates && updates.puDate) {
    updates.weekStart = getMondayOfWeek(String(updates.puDate));
  }

  if ("puScheduledAt" in updates) {
    const dt = updates.puScheduledAt as Date | null;
    if (dt) {
      if (!("puDate" in updates) || !updates.puDate) {
        updates.puDate = dt.toISOString().split("T")[0];
      }
      updates.weekStart = getMondayOfWeek(String(updates.puDate));
    }
    updates.puReminderSentAt = null;
  }

  if ("delScheduledAt" in updates) {
    const dt = updates.delScheduledAt as Date | null;
    if (dt) {
      if (!("delDate" in updates) || !updates.delDate) {
        updates.delDate = dt.toISOString().split("T")[0];
      }
    }
    updates.delReminderSentAt = null;
  }

  const isDispatcherRole = isDispatcher || isAdmin;
  if ((isDispatcherRole || isAccounting) && "loadNumber" in updates) {
    const num = String(updates.loadNumber ?? "").trim();
    if (!num || num.startsWith("NEW-")) {
      res.status(400).json({ error: "Invalid load number" });
      return;
    }
  }

  const effectiveWeek =
    (updates.weekStart as string | undefined) ?? load.weekStart ?? load.puDate ?? todayIsoLocal();
  if (
    await denyIfDispatcherLockedWeek(effectiveWeek, req.userId, req.userRole, res)
  ) {
    return;
  }

  if (isDispatcher || isAdmin) {
    if (req.userRole === "dispatcher" && !load.dispatcherId && !("dispatcherId" in updates)) {
      updates.dispatcherId = req.userId;
    }

    const mergedForValidation = mergeLoadForValidation(load, updates);
    if (!isLoadDraftInProgress(mergedForValidation)) {
      const errors =
        req.userRole === "admin"
          ? validateAdminLoadInput(mergedForValidation)
          : validateDispatcherLoadInput(mergedForValidation);
      if (errors.length > 0) {
        res.status(400).json({ error: `Required fields: ${errors.join(", ")}` });
        return;
      }
    }
  }

  let updated: typeof loadsTable.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(loadsTable)
      .set(updates)
      .where(eq(loadsTable.id, req.params.id))
      .returning();
  } catch (err) {
    req.log.error({ err, loadId: req.params.id, updates }, "Load patch failed");
    res.status(500).json({ error: "Failed to update load" });
    return;
  }

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Notify accounting if B-I diff is negative
  const { biDiff } = computeDiffs(updated);
  if (biDiff !== null && biDiff < 0) {
    // Find accounting users to notify
    const accountingUsers = await db.select().from(usersTable).where(eq(usersTable.role, "accounting"));
    for (const user of accountingUsers) {
      await db.insert(notificationsTable).values({
        id: crypto.randomUUID(),
        userId: user.id,
        text: `Broker underpaid on Load #${updated.loadNumber}. Difference: $${Math.abs(biDiff).toFixed(2)}`,
        loadId: updated.id,
      });
    }
  }

  res.json(serializeLoad(updated));
});

// DELETE /api/loads/:id (admin + dispatcher + accounting, soft delete)
router.delete("/:id", requireAuth, requireRole("admin", "dispatcher", "accounting"), async (req: AuthRequest, res) => {
  const load = await db.query.loadsTable.findFirst({
    where: and(eq(loadsTable.id, req.params.id), eq(loadsTable.isDeleted, false)),
  });
  if (!load) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!enforceLoadBoardPatchScope(load, req.get(LOAD_BOARD_SCOPE_HEADER), res)) {
    return;
  }
  if (req.userRole === "dispatcher" && isLoadDispatcherLocked(load.status)) {
    res.status(403).json({ error: "Load is locked for accounting review" });
    return;
  }
  if (
    await denyIfDispatcherLockedWeek(
      load.weekStart ?? load.puDate ?? todayIsoLocal(),
      req.userId,
      req.userRole,
      res,
    )
  ) {
    return;
  }
  await db.update(loadsTable).set({ isDeleted: true }).where(eq(loadsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
