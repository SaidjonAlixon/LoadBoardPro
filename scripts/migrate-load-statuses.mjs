import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const NEW_STATUSES = ["InQM", "Completed", "NeedRevRC", "Issue"];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  for (const value of NEW_STATUSES) {
    await pool.query(`ALTER TYPE load_status ADD VALUE IF NOT EXISTS '${value}'`);
    console.log(`✓ enum value ${value}`);
  }

  const { rowCount } = await pool.query(
    `UPDATE loads SET status = 'InQM'::load_status WHERE status = 'PickedUp'::load_status`,
  );
  console.log(`✓ migrated PickedUp → InQM (${rowCount ?? 0} rows)`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
