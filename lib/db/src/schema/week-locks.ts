import { pgTable, text, boolean, timestamp, date, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { loadsTable } from "./loads";

export const editRequestStatusEnum = pgEnum("edit_request_status", [
  "pending",
  "approved",
  "denied",
]);

/** Global week-lock automation settings (single row id = default). */
export const weekLockSettingsTable = pgTable("week_lock_settings", {
  id: text("id").primaryKey().default("default"),
  autoLockOnWeekRollover: boolean("auto_lock_on_week_rollover").notNull().default(true),
  lastRolloverLockAt: timestamp("last_rollover_lock_at", { withTimezone: true }),
  updatedBy: text("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Temporary edit permission for a dispatcher on a locked week. */
export const weekEditGrantsTable = pgTable("week_edit_grants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  grantedBy: text("granted_by").notNull().references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Dispatcher requests to edit data on a locked week. */
export const editPermissionRequestsTable = pgTable("edit_permission_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  loadId: text("load_id").notNull().references(() => loadsTable.id),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  requestedBy: text("requested_by").notNull().references(() => usersTable.id),
  fieldDescription: text("field_description").notNull(),
  message: text("message"),
  status: editRequestStatusEnum("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  grantDurationHours: integer("grant_duration_hours"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWeekEditGrantSchema = createInsertSchema(weekEditGrantsTable).omit({
  id: true,
  createdAt: true,
});
export const insertEditPermissionRequestSchema = createInsertSchema(editPermissionRequestsTable).omit({
  id: true,
  createdAt: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  grantDurationHours: true,
});

export type WeekEditGrant = typeof weekEditGrantsTable.$inferSelect;
export type EditPermissionRequest = typeof editPermissionRequestsTable.$inferSelect;
export type WeekLockSettings = typeof weekLockSettingsTable.$inferSelect;
