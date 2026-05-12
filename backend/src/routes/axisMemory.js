// ═══════════════════════════════════════════════════════════════════════════════
// AXIS MEMORY ROUTE
// GET  /axis-memory/:tableId  — todos los registros históricos para esa mesa
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// GET /axis-memory/:tableId
router.get('/:tableId', async (req, res) => {
  const tableId = parseInt(req.params.tableId);
  if (!tableId || isNaN(tableId)) {
    return res.status(400).json({ error: 'tableId inválido' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, table_id, sector_type, sector_id,
              hits, wins, aborts, total_cycles, last_seen_at, updated_at
         FROM axis_memory
        WHERE table_id = $1
        ORDER BY sector_type, sector_id`,
      [tableId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
