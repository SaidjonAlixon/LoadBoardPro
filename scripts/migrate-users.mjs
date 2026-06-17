import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
  );
  const names = cols.rows.map((r) => r.column_name);
  console.log("Current columns:", names);

  if (!names.includes("password_hash")) {
    await pool.query(`ALTER TABLE users ADD COLUMN password_hash text`);
    console.log("Added password_hash column");
  }

  if (names.includes("clerk_id")) {
    await pool.query(`ALTER TABLE users DROP COLUMN clerk_id`);
    console.log("Dropped clerk_id column");
  }

  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL`).catch(() => {
    // may fail if rows exist without password - delete empty users first
  });

  // Remove users without password for clean seed
  await pool.query(`DELETE FROM users WHERE password_hash IS NULL OR password_hash = ''`);

  const after = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
  );
  console.log("After migration:", after.rows.map((r) => r.column_name));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
