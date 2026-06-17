import { pgTable, text, boolean, timestamp, decimal, date, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { driversTable } from "./drivers";
import { brokersTable } from "./brokers";

export const loadStatusEnum = pgEnum("load_status", [
  "Booked",
  "InQM",
  "Delivered",
  "Canceled",
  "Completed",
  "NeedRevRC",
  "Issue",
  "Checked",
  "Invoiced",
  "Reinvoiced",
  "BrokerPaid",
]);

export const loadsTable = pgTable("loads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  loadNumber: text("load_number").notNull().unique(),
  driverId: text("driver_id").references(() => driversTable.id),
  dispatcherId: text("dispatcher_id").references(() => usersTable.id),
  brokerId: text("broker_id").references(() => brokersTable.id),
  puDate: date("pu_date", { mode: "string" }).notNull(),
  delDate: date("del_date", { mode: "string" }).notNull(),
  originCity: text("origin_city").notNull(),
  originState: text("origin_state").notNull(),
  destCity: text("dest_city").notNull(),
  destState: text("dest_state").notNull(),
  mileage: decimal("mileage", { precision: 8, scale: 1 }).notNull(),
  rate: decimal("rate", { precision: 10, scale: 2 }).notNull(),
  status: loadStatusEnum("status").notNull().default("Booked"),
  reimbursement: decimal("reimbursement", { precision: 10, scale: 2 }).notNull().default("0"),
  dispatchNotes: text("dispatch_notes"),
  invoicedAmount: decimal("invoiced_amount", { precision: 10, scale: 2 }),
  brokerPaid: decimal("broker_paid", { precision: 10, scale: 2 }),
  notes: text("notes"),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLoadSchema = createInsertSchema(loadsTable).omit({ id: true, isDeleted: true, createdAt: true, updatedAt: true });
export type InsertLoad = z.infer<typeof insertLoadSchema>;
export type Load = typeof loadsTable.$inferSelect;
