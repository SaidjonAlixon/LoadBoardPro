import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: [
    "./src/schema/users.ts",
    "./src/schema/drivers.ts",
    "./src/schema/brokers.ts",
    "./src/schema/loads.ts",
    "./src/schema/notifications.ts",
    "./src/schema/board-weeks.ts",
    "./src/schema/week-locks.ts",
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
