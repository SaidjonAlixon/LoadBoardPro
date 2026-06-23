/**
 * One-time migration: set week_start to Monday of the calendar week for each load's pu_date.
 * Run: node --env-file=.env scripts/normalize-week-starts.mjs
 */
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function getMondayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const { rows } = await pool.query(
  `SELECT id, pu_date::text AS pu_date, week_start::text AS week_start FROM loads WHERE is_deleted = false`,
);

let updated = 0;
for (const row of rows) {
  const mon = getMondayOfWeek(row.pu_date.slice(0, 10));
  if (mon !== row.week_start.slice(0, 10)) {
    await pool.query(`UPDATE loads SET week_start = $1 WHERE id = $2`, [mon, row.id]);
    updated++;
  }
}

console.log(`Checked ${rows.length} loads, updated ${updated} week_start values.`);
await pool.end();
