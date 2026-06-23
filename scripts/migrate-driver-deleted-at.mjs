/**
 * Add drivers.deleted_at for soft-delete (historical loads keep FK).
 * Run: node --env-file=.env scripts/migrate-driver-deleted-at.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
`);

console.log("drivers.deleted_at ready");
await pool.end();
