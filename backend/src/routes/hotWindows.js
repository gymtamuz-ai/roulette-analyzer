const express = require('express');
const router  = express.Router();
const pool    = require('../db');

/**
 * GET /api/hot-windows/:tableId
 *
 * Returns all saved 36-spin hot-number blocks for a table,
 * ordered by session + window_index ascending.
 */
router.get('/:tableId', async (req, res) => {
  const { tableId } = req.params;
  const id = parseInt(tableId, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'tableId must be a number' });

  try {
    const { rows } = await pool.query(
      `SELECT window_index, session_id, numbers, created_at
         FROM hot_windows
        WHERE table_id = $1
        ORDER BY session_id ASC, window_index ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
