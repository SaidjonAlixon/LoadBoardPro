/**
 * Run: node --env-file=.env scripts/migrate-load-schedule.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `ALTER TABLE loads ADD COLUMN IF NOT EXISTS pu_scheduled_at timestamptz`,
  `ALTER TABLE loads ADD COLUMN IF NOT EXISTS del_scheduled_at timestamptz`,
  `ALTER TABLE loads ADD COLUMN IF NOT EXISTS pu_reminder_sent_at timestamptz`,
  `ALTER TABLE loads ADD COLUMN IF NOT EXISTS del_reminder_sent_at timestamptz`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general'`,
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log("✓", sql.slice(0, 90));
  }
  console.log("\nLoad schedule reminder columns ready.");
} finally {
  await pool.end();
}
