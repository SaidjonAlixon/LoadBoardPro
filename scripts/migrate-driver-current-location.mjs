/**
 * Add drivers.current_location for live driver tracking on dashboard.
 * Run: node --env-file=artifacts/api-server/.env scripts/migrate-driver-current-location.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS current_location text;
`);

console.log("drivers.current_location ready");
await pool.end();
