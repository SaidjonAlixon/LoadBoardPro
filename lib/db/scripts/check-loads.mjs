import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const cols = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'loads' AND column_name IN ('status_board_only', 'created_by_id')
`);
console.log("columns:", cols.rows.map((r) => r.column_name));

const r = await c.query(`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE is_deleted = false)::int AS active,
    count(*) FILTER (WHERE is_deleted = false AND COALESCE(status_board_only, false) = false)::int AS spreadsheet
  FROM loads
`);
console.log("counts:", r.rows[0]);

const w = await c.query(`
  SELECT week_start, count(*)::int
  FROM loads
  WHERE is_deleted = false AND COALESCE(status_board_only, false) = false
  GROUP BY week_start
  ORDER BY week_start DESC
  LIMIT 10
`);
console.log("weeks:", w.rows);

const sample = await c.query(`
  SELECT id, load_number, week_start, origin_city, rate, mileage, status_board_only, created_by_id, dispatcher_id
  FROM loads
  WHERE is_deleted = false
  ORDER BY created_at DESC
  LIMIT 5
`);
console.log("recent:", sample.rows);

await c.end();
