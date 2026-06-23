/**
 * Create board_weeks table and seed current Monday for all dispatchers.
 * Run: node --env-file=.env scripts/migrate-board-weeks.mjs
 */
import pg from "pg";
import { randomUUID } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function getThisWeekStart() {
  const dt = new Date();
  dt.setHours(12, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS board_weeks (
    id text PRIMARY KEY,
    week_start date NOT NULL UNIQUE,
    created_by text REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
`);

const thisWeek = getThisWeekStart();
await pool.query(
  `INSERT INTO board_weeks (id, week_start, created_by) VALUES ($1, $2, NULL) ON CONFLICT (week_start) DO NOTHING`,
  [randomUUID(), thisWeek],
);

const { rows } = await pool.query(`SELECT week_start::text FROM board_weeks ORDER BY week_start DESC`);
console.log(`board_weeks ready (${rows.length} rows). Latest: ${rows[0]?.week_start ?? "none"}`);
await pool.end();
