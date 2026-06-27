import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = `
  ALTER TABLE loads ADD COLUMN IF NOT EXISTS created_by_id text REFERENCES users(id);
`;

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(sql);
console.log("created_by_id column ready");
await client.end();
