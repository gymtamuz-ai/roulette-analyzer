const express = require('express');
const router = express.Router();
const pool = require('../db');
const { calculateFrequencies, calculateDelays, calculateSectorDelays, calculateTrends, calculateBiasMetrics } = require('../utils/analysis');
const { computeBettingState } = require('../utils/betting');

// Full analysis for a session
router.get('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { systemType, passTarget = 2 } = req.query;
  try {
    const { rows: spins } = await pool.query(
      'SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
      [sessionId]
    );

    if (!spins.length) return res.json({ spins: [], empty: true });

    const frequencies = calculateFrequencies(spins);
    const delays = calculateDelays(spins);
    const sectorDelaysA4 = calculateSectorDelays(spins, 'A4');
    const trends = calculateTrends(spins);
    const bettingState = computeBettingState(spins, systemType || null, parseInt(passTarget));

    res.json({
      totalSpins: spins.length,
      frequencies,
      delays,
      sectorDelaysA4,
      trends,
      bettingState
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Long-term bias for a table (all sessions)
router.get('/bias/:tableId', async (req, res) => {
  const { tableId } = req.params;
  try {
    const { rows: spins } = await pool.query(
      'SELECT * FROM spins WHERE table_id = $1 ORDER BY spin_order ASC',
      [tableId]
    );

    const bias = calculateBiasMetrics(spins);
    res.json({ tableId, totalSpins: spins.length, ...bias });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export session data as CSV
router.get('/export/:sessionId', async (req, res) => {
  try {
    const { rows: spins } = await pool.query(
      'SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
      [req.params.sessionId]
    );

    const headers = ['spin_order', 'number', 'color', 'parity', 'dozen', 'col', 'sector_a3', 'sector_a4', 'spun_at'];
    const csv = [
      headers.join(','),
      ...spins.map(s => headers.map(h => s[h] ?? '').join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="session_${req.params.sessionId}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
