import { pgTable, text, timestamp, date } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Shared load-board weeks — visible to all dispatchers. */
export const boardWeeksTable = pgTable("board_weeks", {
  id: text("id").primaryKey(),
  weekStart: date("week_start", { mode: "string" }).notNull().unique(),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
