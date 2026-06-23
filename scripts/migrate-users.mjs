import pg from "pg";
import { createCipheriv, createHmac, randomBytes, scryptSync } from "node:crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function getPasswordPepper() {
  return process.env.USER_PASSWORD_SECRET ?? process.env.JWT_SECRET ?? "dev-secret-change-in-production";
}

function getVaultKey() {
  return scryptSync(getPasswordPepper(), "loadboard-password-vault", 32);
}

function encryptStoredPassword(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function derivePasswordFromNickname(nickname) {
  const normalized = nickname.trim().toLowerCase();
  const local = normalized.replace(/[^a-z0-9]/gi, "") || "user";
  const digest = createHmac("sha256", getPasswordPepper())
    .update(normalized)
    .digest("base64url")
    .replace(/[^a-zA-Z0-9]/g, "");
  const prefix = local.charAt(0).toUpperCase() + local.slice(1, 14);
  return `${prefix}@${digest.slice(0, 10)}!`;
}

async function columnNames() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
  );
  return cols.rows.map((r) => r.column_name);
}

async function uniqueNickname(client, base) {
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await client.query(
      `SELECT id FROM users WHERE nickname = $1 LIMIT 1`,
      [candidate],
    );
    if (existing.rowCount === 0) return candidate;
    candidate = `${base}${suffix++}`;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    let names = await columnNames();
    console.log("Before:", names);

    if (!names.includes("password_hash")) {
      await client.query(`ALTER TABLE users ADD COLUMN password_hash text`);
      console.log("Added password_hash");
    }

    if (names.includes("clerk_id")) {
      await client.query(`ALTER TABLE users DROP COLUMN clerk_id`);
      console.log("Dropped clerk_id");
    }

    if (!names.includes("nickname")) {
      await client.query(`ALTER TABLE users ADD COLUMN nickname text`);
      console.log("Added nickname");
    }

    if (!names.includes("uses_custom_password")) {
      await client.query(
        `ALTER TABLE users ADD COLUMN uses_custom_password boolean NOT NULL DEFAULT false`,
      );
      console.log("Added uses_custom_password");
    }

    if (!names.includes("password_encrypted")) {
      await client.query(`ALTER TABLE users ADD COLUMN password_encrypted text`);
      console.log("Added password_encrypted");
    }

    // email may be NOT NULL + UNIQUE from legacy schema
    await client.query(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`).catch(() => {});
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`).catch(() => {});
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email) WHERE email IS NOT NULL`,
    ).catch(() => {});

    const users = await client.query(
      `SELECT id, email, name, nickname FROM users WHERE nickname IS NULL OR nickname = ''`,
    );
    for (const user of users.rows) {
      const source = user.email?.trim() || user.name?.trim() || "user";
      const baseRaw = source.includes("@") ? source.split("@")[0] : source;
      const base = baseRaw.toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";
      const nickname = await uniqueNickname(client, base);
      await client.query(`UPDATE users SET nickname = $1 WHERE id = $2`, [nickname, user.id]);
      console.log(`Backfilled ${user.email ?? user.id} -> ${nickname}`);
    }

    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique_idx ON users (nickname) WHERE nickname IS NOT NULL`,
    ).catch(() => {});

    const vaultBackfill = await client.query(
      `SELECT id, nickname, email, uses_custom_password, password_encrypted FROM users WHERE password_encrypted IS NULL`,
    );
    for (const user of vaultBackfill.rows) {
      if (user.uses_custom_password) continue;
      const source = user.nickname || (user.email?.includes("@") ? user.email.split("@")[0] : user.email) || "";
      const nickname = String(source).trim().toLowerCase();
      if (!nickname) continue;
      const plain = derivePasswordFromNickname(nickname);
      const encrypted = encryptStoredPassword(plain);
      await client.query(`UPDATE users SET password_encrypted = $1 WHERE id = $2`, [encrypted, user.id]);
      console.log(`Vault backfill ${nickname}`);
    }

    names = await columnNames();
    const sample = await client.query(
      `SELECT id, email, nickname, is_active FROM users ORDER BY created_at LIMIT 10`,
    );
    console.log("After:", names);
    console.log("Users:", sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
