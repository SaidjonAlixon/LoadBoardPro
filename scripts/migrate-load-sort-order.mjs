import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  await pool.query(
    `ALTER TABLE loads ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`,
  );
  console.log("✓ sort_order column ready");

  await pool.query(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(driver_id, '__unassigned__')
          ORDER BY created_at ASC
        ) - 1 AS rn
      FROM loads
      WHERE is_deleted = false
    )
    UPDATE loads l
    SET sort_order = r.rn
    FROM ranked r
    WHERE l.id = r.id
  `);
  console.log("✓ backfilled sort_order per driver");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
