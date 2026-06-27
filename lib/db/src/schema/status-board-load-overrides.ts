import { pgTable, text, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { loadsTable } from "./loads";

/** Status-board display overrides — never written back to Loads spreadsheet rows. */
export const statusBoardLoadOverridesTable = pgTable("status_board_load_overrides", {
  loadId: text("load_id")
    .primaryKey()
    .references(() => loadsTable.id, { onDelete: "cascade" }),
  loadNumber: text("load_number"),
  originCity: text("origin_city"),
  originState: text("origin_state"),
  destCity: text("dest_city"),
  destState: text("dest_state"),
  puDate: date("pu_date", { mode: "string" }),
  delDate: date("del_date", { mode: "string" }),
  puScheduledAt: timestamp("pu_scheduled_at", { withTimezone: true }),
  delScheduledAt: timestamp("del_scheduled_at", { withTimezone: true }),
  dispatchNotes: text("dispatch_notes"),
  hiddenFromBoard: boolean("hidden_from_board").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StatusBoardLoadOverride = typeof statusBoardLoadOverridesTable.$inferSelect;
