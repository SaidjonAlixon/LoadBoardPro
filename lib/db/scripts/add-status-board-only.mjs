import pg from "pg";

const sql = `
  ALTER TABLE loads ADD COLUMN IF NOT EXISTS status_board_only boolean NOT NULL DEFAULT false;
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
console.log("status_board_only column ready");
await client.end();
