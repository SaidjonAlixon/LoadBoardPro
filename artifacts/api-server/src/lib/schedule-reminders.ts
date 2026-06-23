import { db, loadsTable, driversTable, notificationsTable } from "@workspace/db";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { logger } from "./logger";

function formatReminderTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

async function notifyDispatcher(options: {
  dispatcherId: string;
  loadId: string;
  kind: "schedule_pu" | "schedule_del";
  text: string;
}) {
  await db.insert(notificationsTable).values({
    id: crypto.randomUUID(),
    userId: options.dispatcherId,
    text: options.text,
    loadId: options.loadId,
    kind: options.kind,
    isRead: false,
  });
}

export async function processScheduleReminders(): Promise<void> {
  const now = new Date();

  const dueLoads = await db
    .select({
      load: loadsTable,
      driverName: driversTable.fullName,
    })
    .from(loadsTable)
    .leftJoin(driversTable, eq(loadsTable.driverId, driversTable.id))
    .where(
      and(
        eq(loadsTable.isDeleted, false),
        isNotNull(loadsTable.dispatcherId),
        or(
          and(
            isNotNull(loadsTable.puScheduledAt),
            isNull(loadsTable.puReminderSentAt),
            lte(loadsTable.puScheduledAt, now),
          ),
          and(
            isNotNull(loadsTable.delScheduledAt),
            isNull(loadsTable.delReminderSentAt),
            lte(loadsTable.delScheduledAt, now),
          ),
        ),
      ),
    );

  for (const row of dueLoads) {
    const load = row.load;
    const driverName = row.driverName ?? "Driver";
    const dispatcherId = load.dispatcherId!;

    if (
      load.puScheduledAt &&
      !load.puReminderSentAt &&
      load.puScheduledAt <= now
    ) {
      const at = formatReminderTime(load.puScheduledAt);
      await notifyDispatcher({
        dispatcherId,
        loadId: load.id,
        kind: "schedule_pu",
        text: `Pickup reminder: Load #${load.loadNumber} — ${driverName} at ${at}`,
      });
      await db
        .update(loadsTable)
        .set({ puReminderSentAt: now })
        .where(eq(loadsTable.id, load.id));
    }

    const refreshed = await db.query.loadsTable.findFirst({
      where: eq(loadsTable.id, load.id),
    });
    if (!refreshed) continue;

    if (
      refreshed.delScheduledAt &&
      !refreshed.delReminderSentAt &&
      refreshed.delScheduledAt <= now
    ) {
      const at = formatReminderTime(refreshed.delScheduledAt);
      await notifyDispatcher({
        dispatcherId,
        loadId: refreshed.id,
        kind: "schedule_del",
        text: `Delivery reminder: Load #${refreshed.loadNumber} — ${driverName} at ${at}`,
      });
      await db
        .update(loadsTable)
        .set({ delReminderSentAt: now })
        .where(eq(loadsTable.id, refreshed.id));
    }
  }

  if (dueLoads.length > 0) {
    logger.info({ count: dueLoads.length }, "Processed schedule reminders");
  }
}

export function startScheduleReminderJob(): void {
  const tick = () => {
    void processScheduleReminders().catch((err) => {
      logger.warn({ err }, "Schedule reminder job failed");
    });
  };
  setTimeout(tick, 8_000);
  setInterval(tick, 60_000);
}
