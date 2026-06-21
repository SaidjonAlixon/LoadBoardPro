import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["admin", "dispatcher", "accounting", "driver"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Login handle (nickname) — unique identifier for sign-in */
  nickname: text("nickname").unique(),
  /** Legacy / optional contact email */
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  /** AES-GCM encrypted plaintext — admin-only retrieval for dispatcher handoff */
  passwordEncrypted: text("password_encrypted"),
  /** When true, password was set manually and cannot be re-derived */
  usesCustomPassword: boolean("uses_custom_password").notNull().default(false),
  name: text("name"),
  avatarKey: text("avatar_key"),
  role: userRoleEnum("role").notNull().default("dispatcher"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
