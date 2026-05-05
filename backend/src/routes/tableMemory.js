const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// Frecuencia teórica europea: 1 número de 37 posibles
const THEORETICAL_PCT = 100 / 37; // 2.7027...%

/**
 * GET /api/table-memory/:tableId
 *
 * Devuelve el acumulado histórico de esa mesa:
 * {
 *   totalSpins,   — total de tiradas registradas en table_memory
 *   totalBlocks,  — bloques de 36 completados
 *   numbers: [{ number, hits, percentage, deviation }]
 * }
 */
router.get('/:tableId', async (req, res) => {
  const tableId = parseInt(req.params.tableId, 10);
  if (isNaN(tableId)) return res.status(400).json({ error: 'tableId must be a number' });

  try {
    const [memRes, blocksRes] = await Promise.all([
      pool.query(
        `SELECT number, hits
           FROM table_memory
          WHERE table_id = $1
          ORDER BY number ASC`,
        [tableId]
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS total
           FROM hot_windows
          WHERE table_id = $1`,
        [tableId]
      ),
    ]);

    const totalBlocks = blocksRes.rows[0].total;
    const totalSpins  = memRes.rows.reduce((sum, r) => sum + parseInt(r.hits), 0);

    const numbers = memRes.rows.map(r => {
      const hits       = parseInt(r.hits);
      const percentage = totalSpins > 0
        ? parseFloat(((hits / totalSpins) * 100).toFixed(2))
        : 0;
      const deviation  = parseFloat((percentage - THEORETICAL_PCT).toFixed(2));
      return { number: parseInt(r.number), hits, percentage, deviation };
    });

    res.json({ totalSpins, totalBlocks, numbers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
