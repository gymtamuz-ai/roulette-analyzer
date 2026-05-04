const path = require('path');
const { Pool } = require('pg');

// Load .env if present (local dev); in production env vars are set by the platform
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

// ── Connection pool ───────────────────────────────────────────────────────────
// Railway / Render / Heroku provide a single DATABASE_URL connection string.
// Local dev uses individual DB_* variables.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required for Railway/Render managed Postgres
      max: 10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  5_000,
    })
  : new Pool({
      host:     process.env.DB_HOST     || '127.0.0.1',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'roulette_analyzer',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      max: 10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  5_000,
    });

pool.on('error', (err) => {
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
