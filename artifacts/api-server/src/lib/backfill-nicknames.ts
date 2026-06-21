import { db, usersTable } from "@workspace/db";
import { eq, isNull, or } from "drizzle-orm";
import { normalizeNickname } from "./user-credentials";

async function uniqueNickname(base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await db.query.usersTable.findFirst({
      where: eq(usersTable.nickname, candidate),
    });
    if (!existing) return candidate;
    candidate = `${base}${suffix++}`;
  }
}

/** One-time backfill for legacy rows that only had email. */
export async function backfillNicknames(): Promise<void> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(or(isNull(usersTable.nickname), eq(usersTable.nickname, "")));

  for (const user of rows) {
    const source = user.email?.trim() || user.name?.trim() || "user";
    const base = source.includes("@") ? source.split("@")[0]! : source;
    const nickname = await uniqueNickname(
      normalizeNickname(base.replace(/[^a-z0-9_]/gi, "") || "user"),
    );
    await db.update(usersTable).set({ nickname }).where(eq(usersTable.id, user.id));
  }
}
