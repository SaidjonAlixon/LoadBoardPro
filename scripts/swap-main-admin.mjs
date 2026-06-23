import bcrypt from "bcryptjs";
import pg from "pg";
import { createHmac, randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET ?? process.env.USER_PASSWORD_SECRET ?? "dev-secret-change-in-production";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const NEW_ADMIN = {
  email: "saidjonalixon@gmail.com",
  name: "Said Jalixon",
  role: "admin",
};
const OLD_TEST_ADMIN = "admin@test.com";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function derivePasswordFromEmail(email) {
  const normalized = normalizeEmail(email);
  const local = normalized.split("@")[0]?.replace(/[^a-z0-9]/gi, "") || "user";
  const digest = createHmac("sha256", JWT_SECRET)
    .update(normalized)
    .digest("base64url")
    .replace(/[^a-zA-Z0-9]/g, "");
  const prefix = local.charAt(0).toUpperCase() + local.slice(1, 14);
  const token = digest.slice(0, 10);
  return `${prefix}@${token}!`;
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const generatedPassword = derivePasswordFromEmail(NEW_ADMIN.email);
  const passwordHash = await bcrypt.hash(generatedPassword, 12);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         is_active = true`,
      [randomUUID(), NEW_ADMIN.email, passwordHash, NEW_ADMIN.name, NEW_ADMIN.role],
    );
    console.log(`✓ Admin ready: ${NEW_ADMIN.email}`);

    const old = await client.query(`SELECT id FROM users WHERE email = $1`, [OLD_TEST_ADMIN]);
    if (old.rows.length) {
      const oldId = old.rows[0].id;
      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [oldId]);
      await client.query(`UPDATE loads SET dispatcher_id = NULL WHERE dispatcher_id = $1`, [oldId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [oldId]);
      console.log(`✓ Removed test admin: ${OLD_TEST_ADMIN}`);
    } else {
      console.log(`— Test admin not found: ${OLD_TEST_ADMIN}`);
    }

    await client.query("COMMIT");
    console.log(`\nLogin email:    ${NEW_ADMIN.email}`);
    console.log(`Login password: ${generatedPassword}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
