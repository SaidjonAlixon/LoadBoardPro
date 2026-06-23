import bcrypt from "bcryptjs";
import pg from "pg";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const TEST_PASSWORD = "Test1234!";

const TEST_USERS = [
  { email: "dispatcher@test.com", name: "Test Dispatcher", role: "dispatcher" },
  { email: "accounting@test.com", name: "Test Accounting", role: "accounting" },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  for (const user of TEST_USERS) {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         is_active = true`,
      [randomUUID(), user.email, passwordHash, user.name, user.role],
    );
    console.log(`✓ ${user.role.padEnd(12)} ${user.email}`);
  }

  console.log(`\nPassword for all: ${TEST_PASSWORD}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
