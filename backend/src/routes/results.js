const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/results/session/:sessionId — all results for a session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, s.number, s.color, s.sector_a3, s.sector_a4
       FROM session_results r
       JOIN spins s ON s.id = r.spin_id
       WHERE r.session_id = $1
       ORDER BY r.spin_index ASC`,
      [req.params.sessionId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/results/session/:sessionId/summary — aggregate stats
router.get('/session/:sessionId/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::INTEGER                                     AS total_bets,
         COUNT(*) FILTER (WHERE result = 'win')::INTEGER      AS wins,
         COUNT(*) FILTER (WHERE result = 'loss')::INTEGER     AS losses,
         COALESCE(SUM(profit), 0)::INTEGER                    AS total_profit,
         COALESCE(SUM(bet_chips), 0)::INTEGER                 AS total_wagered,
         COALESCE(MAX(balance_after), 0)::INTEGER             AS current_balance,
         COALESCE(MIN(balance_after), 0)::INTEGER             AS min_balance,
         COALESCE(MAX(balance_after), 0)::INTEGER             AS max_balance
       FROM session_results
       WHERE session_id = $1`,
      [req.params.sessionId]
    );
    const s = rows[0];
    const winRate = s.total_bets > 0 ? parseFloat(((s.wins / s.total_bets) * 100).toFixed(1)) : 0;
    const roi = s.total_wagered > 0 ? parseFloat(((s.total_profit / s.total_wagered) * 100).toFixed(2)) : 0;
    res.json({ ...s, win_rate: winRate, roi });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
