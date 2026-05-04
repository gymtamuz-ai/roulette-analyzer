const path = require('path');

// Load .env if present (local dev only — production uses platform env vars)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));

// ── Healthcheck endpoints — MUST respond 200 immediately, before DB ───────────
// Railway checks these right after the server starts. No DB queries here.
app.get('/', (req, res) => res.json({ ok: true, service: 'roulette-analyzer-backend' }));
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms    = Date.now() - start;
    const color = res.statusCode >= 500 ? '31' : res.statusCode >= 400 ? '33' : '32';
    console.log(`\x1b[${color}m${req.method} ${req.path} ${res.statusCode}\x1b[0m ${ms}ms`);
  });
  next();
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/tables',   require('./routes/tables'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/spins',    require('./routes/spins'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/results',  require('./routes/results'));

// ── /api/health — always 200; DB status in the body only ─────────────────────
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    // Short timeout so this never hangs
    const pool = require('./db');
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
    ]);
    dbOk = true;
  } catch (_) { /* db not ready — still return 200 */ }

  // Always 200: the HTTP server itself is healthy.
  // DB status is informational only.
  res.json({ ok: true, db: dbOk ? 'connected' : 'unavailable', ts: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('💥 Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── DB schema ─────────────────────────────────────────────────────────────────
async function initDb() {
  try {
    const pool = require('./db');
    const sql  = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Schema ready');
  } catch (err) {
    console.error('⚠️  Schema warning:', err.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);

async function boot() {
  // 1. Start HTTP server FIRST — Railway needs /health to respond immediately
  await new Promise((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server listening on port ${PORT}`);
      console.log(`   NODE_ENV  : ${process.env.NODE_ENV || 'development'}`);
      console.log(`   DB mode   : ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'individual vars'}`);
      resolve(server);
    });
    server.on('error', reject);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('📦 SIGTERM — shutting down...');
      server.close(() => {
        try { require('./db').end(); } catch (_) {}
        process.exit(0);
      });
    });
  });

  // 2. Connect to DB in background — server already up, health checks pass
  const { testConnection } = require('./db');
  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ok = await testConnection();
    if (ok) { await initDb(); break; }
    if (attempt < MAX_RETRIES) {
      const wait = attempt * 2000;
      console.log(`⏳ DB retry ${attempt}/${MAX_RETRIES} in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      console.error('❌ DB unavailable after all retries. API requests needing DB will fail.');
    }
  }
}

// Catch any uncaught startup errors
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});

boot().catch((err) => {
  console.error('❌ Boot failed:', err.message);
  process.exit(1);
});
