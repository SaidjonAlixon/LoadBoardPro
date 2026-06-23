/**
 * Run: node --env-file=.env scripts/migrate-driver-board.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `DO $$ BEGIN
    CREATE TYPE driver_board_status AS ENUM (
      'Ready', 'Covered', 'Deadhead', 'AtPickUp', 'InTransit',
      'AtDelivery', 'TruckIssue', 'Sleep', 'Home'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS board_status driver_board_status NOT NULL DEFAULT 'Ready'`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS board_note text`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS prebook text`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS odometer integer`,
  `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS eta text`,
];

try {
  for (const sql of statements) {
    await pool.query(sql);
    console.log("✓", sql.split("\n")[0].slice(0, 80));
  }
  console.log("\nDriver board columns ready.");
} finally {
  await pool.end();
}
