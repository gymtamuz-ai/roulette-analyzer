const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const { tableId } = req.query;
  try {
    let q = 'SELECT s.*, COUNT(sp.id) AS spin_count FROM sessions s LEFT JOIN spins sp ON sp.session_id = s.id';
    const params = [];
    if (tableId) {
      q += ' WHERE s.table_id = $1';
      params.push(tableId);
    }
    q += ' GROUP BY s.id ORDER BY s.started_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { tableId, name = '' } = req.body;
  if (!tableId) return res.status(400).json({ error: 'tableId is required' });
  try {
    // Deactivate other active sessions for this table
    await pool.query('UPDATE sessions SET is_active = false WHERE table_id = $1 AND is_active = true', [tableId]);
    const { rows } = await pool.query(
      'INSERT INTO sessions (table_id, name) VALUES ($1, $2) RETURNING *',
      [tableId, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT s.*, COUNT(sp.id) AS spin_count FROM sessions s LEFT JOIN spins sp ON sp.session_id = s.id WHERE s.id = $1 GROUP BY s.id',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/end', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE sessions SET is_active = false, ended_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
