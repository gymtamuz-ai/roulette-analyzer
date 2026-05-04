const path = require('path');
const { Pool } = require('pg');

// Load .env for local dev (ignored if file doesn't exist)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ── Connection pool ───────────────────────────────────────────────────────────
// Railway / Render provide DATABASE_URL automatically when a Postgres plugin is added.
// Local dev falls back to individual DB_* vars.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString:        process.env.DATABASE_URL,
      ssl:                     { rejectUnauthorized: false },
      max:                     10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  3_000, // fail fast so healthcheck doesn't hang
    })
  : new Pool({
      host:     process.env.DB_HOST     || '127.0.0.1',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'roulette_analyzer',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      max:                     10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  3_000,
    });

pool.on('error', (err) => {
  // Log but don't crash — the server stays up even if DB drops temporarily
  console.error('❌ PostgreSQL pool error:', err.message);
});

// ── Connection test ───────────────────────────────────────────────────────────
async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return false;
  } finally {
    if (client) client.release();
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;
