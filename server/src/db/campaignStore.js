const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    })
  : null;

let schemaPromise;

async function ensureSchema() {
  if (!pool) return false;
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => true).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

async function save(campaign) {
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `INSERT INTO campaigns (id, state, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
     SET state = EXCLUDED.state, updated_at = NOW()`,
    [campaign.id, JSON.stringify(campaign)],
  );
}

async function get(id) {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query(
    "SELECT state FROM campaigns WHERE id = $1",
    [id],
  );
  return result.rows[0]?.state || null;
}

module.exports = { get, save };