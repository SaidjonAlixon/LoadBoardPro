import { pgTable, text, boolean, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driverTypeEnum = pgEnum("driver_type", ["OO", "CD", "Lease"]);

export const driverBoardStatusEnum = pgEnum("driver_board_status", [
  "Ready",
  "Covered",
  "Deadhead",
  "AtPickUp",
  "InTransit",
  "AtDelivery",
  "TruckIssue",
  "Sleep",
  "Home",
]);

export const driversTable = pgTable("drivers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fullName: text("full_name").notNull(),
  driverType: driverTypeEnum("driver_type").notNull(),
  phone: text("phone"),
  email: text("email"),
  truckNumber: text("truck_number"),
  currentLocation: text("current_location"),
  boardStatus: driverBoardStatusEnum("board_status").notNull().default("Ready"),
  boardNote: text("board_note"),
  prebook: text("prebook"),
  odometer: integer("odometer"),
  eta: text("eta"),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
