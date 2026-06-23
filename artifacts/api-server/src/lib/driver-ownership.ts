import { db, loadsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/** True when the dispatcher has at least one non-deleted load assigned to this driver. */
export async function dispatcherOwnsDriver(
  dispatcherId: string,
  driverId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: loadsTable.id })
    .from(loadsTable)
    .where(and(
      eq(loadsTable.isDeleted, false),
      eq(loadsTable.dispatcherId, dispatcherId),
      eq(loadsTable.driverId, driverId),
      sql`${loadsTable.driverId} is not null`,
    ))
    .limit(1);

  return rows.length > 0;
}
