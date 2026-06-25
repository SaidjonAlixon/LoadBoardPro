import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const sql = `
ALTER TABLE board_weeks ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE board_weeks ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE board_weeks ADD COLUMN IF NOT EXISTS locked_by text REFERENCES users(id);
ALTER TABLE board_weeks ADD COLUMN IF NOT EXISTS scheduled_lock_at timestamptz;
DO $$ BEGIN
  CREATE TYPE edit_request_status AS ENUM ('pending','approved','denied');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE TABLE IF NOT EXISTS week_lock_settings (
  id text PRIMARY KEY DEFAULT 'default',
  auto_lock_on_week_rollover boolean NOT NULL DEFAULT true,
  last_rollover_lock_at timestamptz,
  updated_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS week_edit_grants (
  id text PRIMARY KEY,
  week_start date NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  granted_by text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS edit_permission_requests (
  id text PRIMARY KEY,
  load_id text NOT NULL REFERENCES loads(id),
  week_start date NOT NULL,
  requested_by text NOT NULL REFERENCES users(id),
  field_description text NOT NULL,
  message text,
  status edit_request_status NOT NULL DEFAULT 'pending',
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  grant_duration_hours integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO week_lock_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
`;

try {
  await pool.query(sql);
  console.log("Week-lock migration applied.");
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await pool.end();
}
