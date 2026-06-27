import pg from "pg";

const sql = `
  CREATE TABLE IF NOT EXISTS status_board_load_overrides (
    load_id text PRIMARY KEY REFERENCES loads(id) ON DELETE CASCADE,
    load_number text,
    origin_city text,
    origin_state text,
    dest_city text,
    dest_state text,
    pu_date date,
    del_date date,
    pu_scheduled_at timestamptz,
    del_scheduled_at timestamptz,
    dispatch_notes text,
    hidden_from_board boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
console.log("status_board_load_overrides table ready");
await client.end();
