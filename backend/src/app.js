const path = require('path');

// Load .env if present (local dev); production env vars come from platform
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const pool    = require('./db');
const { testConnection } = require('./db');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow any origin (safe for a read-heavy analytics tool with no auth tokens).
// To restrict: set FRONTEND_URL=https://your-app.vercel.app in env vars,
// then replace origin: true with origin: process.env.FRONTEND_URL.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));

// ── Request logging (compact) ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const color = res.statusCode >= 500 ? '31' : res.statusCode >= 400 ? '33' : '32';
    console.log(`\x1b[${color}m${req.method} ${req.path} ${res.statusCode}\x1b[0m ${ms}ms`);
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/tables',   require('./routes/tables'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/spins',    require('./routes/spins'));
app.use('/api/analysis', require('./routes/analysis'));
app.use('/api/results',  require('./routes/results'));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected', ts: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'disconnected', error: err.message, ts: new Date().toISOString() });
  }
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── DB schema init ────────────────────────────────────────────────────────────
async function initDb() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Schema ready');
  } catch (err) {
    console.error('⚠️  Schema warning:', err.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function boot() {
  // Start HTTP server immediately (Railway health checks need a response fast)
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   DB mode:  ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'individual vars'}`);
  });

  // DB connection with retries (Railway Postgres may take a few seconds to be ready)
  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const ok = await testConnection();
    if (ok) {
      await initDb();
      break;
    }
    if (attempt < MAX_RETRIES) {
      const wait = attempt * 2000; // 2s, 4s, 6s, 8s
      console.log(`⏳ DB retry ${attempt}/${MAX_RETRIES} in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      console.error('❌ Could not connect to DB after all retries. Server stays up, requests will fail.');
    }
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📦 SIGTERM received — shutting down gracefully...');
    server.close(() => {
      pool.end();
      process.exit(0);
    });
  });
}

boot();
