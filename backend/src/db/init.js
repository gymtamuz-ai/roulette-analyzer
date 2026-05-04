const fs = require('fs');
const path = require('path');
const pool = require('./index');

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  } finally {
    await pool.end();
  }
}

initDb();
