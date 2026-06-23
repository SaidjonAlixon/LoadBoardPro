import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
  );
  const names = cols.rows.map((r) => r.column_name);

  if (!names.includes("avatar_key")) {
    await pool.query(`ALTER TABLE users ADD COLUMN avatar_key text`);
    console.log("✓ avatar_key column ready");
  } else {
    console.log("✓ avatar_key column already exists");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
