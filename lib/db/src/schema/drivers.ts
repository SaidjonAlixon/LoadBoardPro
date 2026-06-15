import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driverTypeEnum = pgEnum("driver_type", ["OO", "CD", "Lease"]);

export const driversTable = pgTable("drivers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fullName: text("full_name").notNull(),
  driverType: driverTypeEnum("driver_type").notNull(),
  phone: text("phone"),
  email: text("email"),
  truckNumber: text("truck_number"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
