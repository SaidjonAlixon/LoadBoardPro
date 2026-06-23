/**
 * Run: node --env-file=.env scripts/migrate-load-number-non-unique.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `ALTER TABLE loads DROP CONSTRAINT IF EXISTS loads_load_number_unique`,
  `DROP INDEX IF EXISTS loads_load_number_unique`,
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log("✓", sql);
  }
  console.log("\nLoad number may now repeat across loads.");
} finally {
  await pool.end();
}
