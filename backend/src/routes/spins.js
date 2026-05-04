const express = require('express');
const router = express.Router();
const pool = require('../db');
const { classifyNumber } = require('../utils/roulette');
const { computeBettingState, calculateBetResult }      = require('../utils/betting');
const { computeJacoboState, calculateJacoboBetResult } = require('../utils/jacobo');
const { computeMirrorState, calculateMirrorBetResult } = require('../utils/mirror');
const { computeBestSystem }                            = require('../utils/autoSystem');

// ─── Compute bet result for any mode ──────────────────────────────────────────
function computeActiveBetResult(previousSpins, newSpinCls, passTarget, systemType, bettingMode, mirrorMode = 'color') {
  if (bettingMode === 'jacobo') {
    const state = computeJacoboState(previousSpins);
    return calculateJacoboBetResult(state, newSpinCls.number);
  }
  if (bettingMode === 'mirror') {
    const state = computeMirrorState(previousSpins, mirrorMode);
    return calculateMirrorBetResult(state, newSpinCls);
  }
  if (bettingMode === 'auto') {
    const auto = computeBestSystem(previousSpins, passTarget, systemType);
    if (!auto.system) return null;
    if (auto.system === 'ESPEJO') {
      const state = computeMirrorState(previousSpins, auto.mirrorMode || 'color');
      return calculateMirrorBetResult(state, newSpinCls);
    }
    if (auto.system === 'JACOBO') {
      const state = computeJacoboState(previousSpins);
      return calculateJacoboBetResult(state, newSpinCls.number);
    }
    // SECTORES
    const state = computeBettingState(previousSpins, systemType, parseInt(passTarget));
    return calculateBetResult(state, newSpinCls.sector_a3, newSpinCls.sector_a4);
  }
  // Default: sectors (A3/A4)
  const state = computeBettingState(previousSpins, systemType, parseInt(passTarget));
  return calculateBetResult(state, newSpinCls.sector_a3, newSpinCls.sector_a4);
}

router.get('/', async (req, res) => {
  const { sessionId, tableId, limit = 5000, offset = 0 } = req.query;
  try {
    const conditions = [];
    const params = [];
    if (sessionId) { conditions.push(`session_id = $${params.length + 1}`); params.push(sessionId); }
    if (tableId) { conditions.push(`table_id = $${params.length + 1}`); params.push(tableId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit));
    params.push(parseInt(offset));
    const { rows } = await pool.query(
      `SELECT * FROM spins ${where} ORDER BY spin_order ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { sessionId, number, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color' } = req.body;
  if (sessionId === undefined || number === undefined) {
    return res.status(400).json({ error: 'sessionId and number are required' });
  }
  const n = parseInt(number);
  if (isNaN(n) || n < 0 || n > 36) {
    return res.status(400).json({ error: 'number must be 0-36' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get session info
    const sessionRes = await client.query('SELECT table_id FROM sessions WHERE id = $1', [sessionId]);
    if (!sessionRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Session not found' });
    }
    const tableId = sessionRes.rows[0].table_id;

    // Fetch all PREVIOUS spins to compute betting state BEFORE this spin
    const prevSpinsRes = await client.query(
      'SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
      [sessionId]
    );
    const previousSpins = prevSpinsRes.rows;
    const spinOrder = previousSpins.length;

    // Insert the new spin
    const cls = classifyNumber(n);
    const { rows: [newSpin] } = await client.query(
      `INSERT INTO spins (session_id, table_id, number, color, parity, dozen, col, sector_a3, sector_a4, spin_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [sessionId, tableId, n, cls.color, cls.parity, cls.dozen, cls.col, cls.sector_a3, cls.sector_a4, spinOrder]
    );

    // Calculate and persist bet result using the active betting mode
    let betResult = computeActiveBetResult(previousSpins, cls, passTarget, systemType, bettingMode, mirrorMode);
    if (betResult) {
      // Get current running balance for this session
      const balRes = await client.query(
        'SELECT COALESCE(SUM(profit), 0)::INTEGER as balance FROM session_results WHERE session_id = $1',
        [sessionId]
      );
      const balanceAfter = parseInt(balRes.rows[0].balance) + betResult.profit;

      await client.query(
        `INSERT INTO session_results
           (session_id, spin_id, spin_index, system_type, bet_sectors, bet_chips, multiplier,
            result, payout, profit, balance_after,
            jacobo_active, jacobo_confidence, jacobo_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          sessionId, newSpin.id, spinOrder,
          betResult.systemType, betResult.betSectors,
          betResult.chips, betResult.multiplier,
          betResult.result, betResult.payout,
          betResult.profit, balanceAfter,
          betResult.jacoboActive   ?? null,
          betResult.jacoboConfidence ?? null,
          betResult.jacoboReason   ?? null,
        ]
      );
      betResult.balance_after = balanceAfter;
    }

    await client.query('COMMIT');
    res.status(201).json({ ...newSpin, bet_result: betResult });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Delete last spin (and its result) from a session
router.delete('/last', async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'DELETE FROM spins WHERE id = (SELECT id FROM spins WHERE session_id = $1 ORDER BY spin_order DESC LIMIT 1) RETURNING *',
      [sessionId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No spins to delete' });
    }
    // Delete associated result if exists
    await client.query('DELETE FROM session_results WHERE spin_id = $1', [rows[0].id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Bulk import (simulation) — also records results
router.post('/bulk', async (req, res) => {
  const { sessionId, numbers, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color' } = req.body;
  if (!sessionId || !Array.isArray(numbers)) {
    return res.status(400).json({ error: 'sessionId and numbers[] required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessionRes = await client.query('SELECT table_id FROM sessions WHERE id = $1', [sessionId]);
    if (!sessionRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Session not found' }); }
    const tableId = sessionRes.rows[0].table_id;

    let spinsInSession = (await client.query('SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC', [sessionId])).rows;
    let runningBalance = parseInt((await client.query('SELECT COALESCE(SUM(profit),0)::INTEGER as b FROM session_results WHERE session_id = $1', [sessionId])).rows[0].b);

    const inserted = [];
    for (const n of numbers) {
      const num = parseInt(n);
      if (isNaN(num) || num < 0 || num > 36) continue;

      const cls = classifyNumber(num);
      const spinOrder = spinsInSession.length;

      const { rows: [spin] } = await client.query(
        `INSERT INTO spins (session_id, table_id, number, color, parity, dozen, col, sector_a3, sector_a4, spin_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [sessionId, tableId, num, cls.color, cls.parity, cls.dozen, cls.col, cls.sector_a3, cls.sector_a4, spinOrder]
      );

      const betResult = computeActiveBetResult(spinsInSession, cls, passTarget, systemType, bettingMode, mirrorMode);
      if (betResult) {
        runningBalance += betResult.profit;
        await client.query(
          `INSERT INTO session_results
             (session_id, spin_id, spin_index, system_type, bet_sectors, bet_chips, multiplier,
              result, payout, profit, balance_after,
              jacobo_active, jacobo_confidence, jacobo_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            sessionId, spin.id, spinOrder,
            betResult.systemType, betResult.betSectors, betResult.chips, betResult.multiplier,
            betResult.result, betResult.payout, betResult.profit, runningBalance,
            betResult.jacoboActive    ?? null,
            betResult.jacoboConfidence ?? null,
            betResult.jacoboReason    ?? null,
          ]
        );
      }

      spinsInSession.push(spin);
      inserted.push(spin.id);
    }

    await client.query('COMMIT');
    res.status(201).json({ inserted: inserted.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
