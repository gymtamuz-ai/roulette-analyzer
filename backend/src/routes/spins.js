const express = require('express');
const router = express.Router();
const pool = require('../db');
const { classifyNumber } = require('../utils/roulette');
const { acquireSessionLock, nextSpinOrder, updateWindowAnalytics, buildCrossSessionQuery } = require('../utils/spinHelpers');
const { computeBettingState, calculateBetResult }      = require('../utils/betting');
const { computeJacoboState, calculateJacoboBetResult } = require('../utils/jacobo');
const { computeMirrorState, calculateMirrorBetResult } = require('../utils/mirror');
const { computeBestSystem }                            = require('../utils/autoSystem');
const { computeHotNumbers }                            = require('../utils/hotNumbers');
const { computeVecinosState, calculateVecinosBetResult, calculateVecinosFlatResult } = require('../utils/vecinos');
const { computeAxisState, calculateAxisBetResult }                                    = require('../utils/axis');
const { computeProgressionStep, getProgressionEntry }                                 = require('../utils/axisProgression');
const { computeEchoState, calculateEchoBetResult }                                    = require('../utils/echo');

// ─── Compute bet result for any mode ──────────────────────────────────────────
function computeActiveBetResult(previousSpins, newSpinCls, passTarget, systemType, bettingMode, mirrorMode = 'color', lockedSystem = null, vecinosBettingType = 'progressive', axisProgressionStep = 1) {
  if (bettingMode === 'echo') {
    const state = computeEchoState(previousSpins);
    return calculateEchoBetResult(state, newSpinCls.number);
  }
  if (bettingMode === 'axis') {
    const state = computeAxisState(previousSpins);
    return calculateAxisBetResult(state, newSpinCls.number, axisProgressionStep);
  }
  if (bettingMode === 'jacobo') {
    const state = computeJacoboState(previousSpins);
    return calculateJacoboBetResult(state, newSpinCls.number);
  }
  if (bettingMode === 'mirror') {
    const state = computeMirrorState(previousSpins, mirrorMode);
    return calculateMirrorBetResult(state, newSpinCls);
  }
  if (bettingMode === 'vecinos') {
    const state = computeVecinosState(previousSpins);
    if (vecinosBettingType === 'flat') return calculateVecinosFlatResult(state, newSpinCls.number);
    return calculateVecinosBetResult(state, newSpinCls.number);
  }
  if (bettingMode === 'auto') {
    const auto = computeBestSystem(previousSpins, passTarget, systemType, lockedSystem);
    if (!auto.system) return null;
    if (auto.system === 'ESPEJO') {
      const state = computeMirrorState(previousSpins, auto.mirrorMode || 'color');
      return calculateMirrorBetResult(state, newSpinCls);
    }
    if (auto.system === 'JACOBO') {
      const state = computeJacoboState(previousSpins);
      return calculateJacoboBetResult(state, newSpinCls.number);
    }
    if (auto.system === 'VECINOS') {
      const state = computeVecinosState(previousSpins);
      if (vecinosBettingType === 'flat') return calculateVecinosFlatResult(state, newSpinCls.number);
      return calculateVecinosBetResult(state, newSpinCls.number);
    }
    if (auto.system === 'AXIS') {
      const state = computeAxisState(previousSpins);
      return calculateAxisBetResult(state, newSpinCls.number, axisProgressionStep);
    }
    if (auto.system === 'ECHO') {
      const state = computeEchoState(previousSpins);
      return calculateEchoBetResult(state, newSpinCls.number);
    }
    // SECTORES — AUTO MODE siempre usa A4, nunca A3
    const state = computeBettingState(previousSpins, 'A4', parseInt(passTarget));
    return calculateBetResult(state, newSpinCls.sector_a3, newSpinCls.sector_a4);
  }
  // Default: sectors (A3/A4)
  const state = computeBettingState(previousSpins, systemType, parseInt(passTarget));
  return calculateBetResult(state, newSpinCls.sector_a3, newSpinCls.sector_a4);
}

router.get('/', async (req, res) => {
  const { sessionId, tableId, limit = 5000, offset = 0 } = req.query;
  try {
    let rows;
    if (tableId && !sessionId) {
      // Cross-session query: use chronological ordering via session started_at
      const q = buildCrossSessionQuery(parseInt(tableId), parseInt(limit), parseInt(offset));
      ({ rows } = await pool.query(q));
    } else {
      // Single-session or unfiltered: spin_order is reliable within one session
      const conditions = [];
      const params = [];
      if (sessionId) { conditions.push(`session_id = $${params.length + 1}`); params.push(sessionId); }
      if (tableId)   { conditions.push(`table_id = $${params.length + 1}`);   params.push(tableId);   }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(parseInt(limit));
      params.push(parseInt(offset));
      ({ rows } = await pool.query(
        `SELECT * FROM spins ${where} ORDER BY spin_order ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ));
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  let { sessionId, number, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color', lockedSystem = null, vecinosBettingType = 'progressive' } = req.body;
  // Safety: A3 was removed; remap any legacy A3 reference to A4
  if (systemType === 'A3') systemType = 'A4';
  if (lockedSystem === 'A3') lockedSystem = 'A4';
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

    // ── Advisory lock: serializes concurrent writers for this session ─────────
    // Lock is released automatically at COMMIT/ROLLBACK.
    await acquireSessionLock(client, sessionId);

    // Get session info
    const sessionRes = await client.query('SELECT table_id FROM sessions WHERE id = $1', [sessionId]);
    if (!sessionRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Session not found' });
    }
    const tableId = sessionRes.rows[0].table_id;

    // ── Atomic spin_order: MAX+1 (safe after advisory lock) ───────────────────
    const spinOrder = await nextSpinOrder(client, sessionId);

    // Fetch all PREVIOUS spins to compute betting state BEFORE this spin
    const prevSpinsRes = await client.query(
      'SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
      [sessionId]
    );
    const previousSpins = prevSpinsRes.rows;

    // Insert the new spin
    const cls = classifyNumber(n);
    const { rows: [newSpin] } = await client.query(
      `INSERT INTO spins (session_id, table_id, number, color, parity, dozen, col, sector_a3, sector_a4, spin_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [sessionId, tableId, n, cls.color, cls.parity, cls.dozen, cls.col, cls.sector_a3, cls.sector_a4, spinOrder]
    );

    // ── AXIS6Stars progression step ────────────────────────────────────────────
    // Query previous AXIS results to determine current step before this spin.
    // Step advances on loss, resets on win, persists across sector switches.
    let axisProgressionStep = 1;
    if (bettingMode === 'axis' || bettingMode === 'auto') {
      try {
        const prevAxisRes = await client.query(
          `SELECT result FROM session_results
           WHERE session_id = $1 AND system_type = 'AXIS'
           ORDER BY spin_index ASC`,
          [sessionId]
        );
        axisProgressionStep = computeProgressionStep(prevAxisRes.rows);
      } catch (_) { /* non-fatal — falls back to step 1 (flat) */ }
    }

    // Calculate and persist bet result using the active betting mode
    let betResult = computeActiveBetResult(previousSpins, cls, passTarget, systemType, bettingMode, mirrorMode, lockedSystem, vecinosBettingType, axisProgressionStep);
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

    // ── AXIS Memory — upsert when an AXIS cycle ends on this spin ────────────
    // Only update when AXIS is actually active (axis mode or auto mode that may select AXIS)
    if (bettingMode === 'axis' || bettingMode === 'auto') {
      // Compare state before and after to detect cycle end
      try {
        const stateBefore = computeAxisState(previousSpins);
        if (stateBefore.isActive && stateBefore.spinsRemaining > 0) {
          // Build the fake spin object the engine expects
          const spinForEngine = { number: n, ...classifyNumber(n) };
          const stateAfter  = computeAxisState([...previousSpins, spinForEngine]);

          const cycleJustEnded = !stateAfter.isActive ||
            stateAfter.cyclesWon > stateBefore.cyclesWon ||
            stateAfter.cyclesAborted > stateBefore.cyclesAborted;

          if (cycleJustEnded) {
            const isWin = stateAfter.cyclesWon > stateBefore.cyclesWon;

            // Determine sector type and id from state BEFORE (that's what was active)
            let sType, sId;
            if (stateBefore.status === 'TRIGGERED_ECLIPSE') {
              sType = 'E'; sId = stateBefore.aceNumber;
            } else if (stateBefore.status === 'TRIGGERED_H') {
              sType = 'H'; sId = stateBefore.triggeredH;
            } else if (stateBefore.status === 'TRIGGERED_V') {
              sType = 'V'; sId = stateBefore.triggeredV;
            }

            if (sType && sId != null) {
              await pool.query(
                `INSERT INTO axis_memory
                   (table_id, sector_type, sector_id, hits, wins, aborts, total_cycles, last_seen_at)
                 VALUES ($1, $2, $3, 1, $4, $5, 1, NOW())
                 ON CONFLICT (table_id, sector_type, sector_id)
                 DO UPDATE SET
                   hits         = axis_memory.hits + 1,
                   wins         = axis_memory.wins + $4,
                   aborts       = axis_memory.aborts + $5,
                   total_cycles = axis_memory.total_cycles + 1,
                   last_seen_at = NOW(),
                   updated_at   = NOW()`,
                [tableId, sType, sId, isWin ? 1 : 0, isWin ? 0 : 1]
              );
            }
          }
        }
      } catch (_) { /* non-fatal */ }
    }

    // ── Hot window + table_memory — every 36th spin in the session ──────────
    // Use the shared idempotent helper (skips already-recorded blocks)
    const totalSpins = spinOrder + 1;
    if (totalSpins % 36 === 0) {
      try {
        const allSpinsRes = await pool.query(
          'SELECT number FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
          [sessionId]
        );
        await updateWindowAnalytics(pool, sessionId, tableId, allSpinsRes.rows, 'append');
      } catch (_) { /* non-fatal — don't break the response */ }
    }

    res.status(201).json({
      ...newSpin,
      bet_result:              betResult,
      axis_progression_step:   axisProgressionStep,
    });
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

    // ── Advisory lock: serialize concurrent bulk imports for this session ──────
    await acquireSessionLock(client, sessionId);

    const sessionRes = await client.query('SELECT table_id FROM sessions WHERE id = $1', [sessionId]);
    if (!sessionRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Session not found' }); }
    const tableId = sessionRes.rows[0].table_id;

    let spinsInSession = (await client.query('SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC', [sessionId])).rows;
    let runningBalance = parseInt((await client.query('SELECT COALESCE(SUM(profit),0)::INTEGER as b FROM session_results WHERE session_id = $1', [sessionId])).rows[0].b);

    // ── Pre-load AXIS progression state for bulk replay ───────────────────────
    let axisProgressionStep = 1;
    if (bettingMode === 'axis' || bettingMode === 'auto') {
      try {
        const prevAxisRes = await client.query(
          `SELECT result FROM session_results
           WHERE session_id = $1 AND system_type = 'AXIS'
           ORDER BY spin_index ASC`,
          [sessionId]
        );
        axisProgressionStep = computeProgressionStep(prevAxisRes.rows);
      } catch (_) { /* non-fatal — falls back to step 1 */ }
    }

    const inserted = [];
    for (const n of numbers) {
      const num = parseInt(n);
      if (isNaN(num) || num < 0 || num > 36) continue;

      const cls = classifyNumber(num);
      // spin_order is safe: sequential in-loop counter after advisory lock
      const spinOrder = spinsInSession.length;

      const { rows: [spin] } = await client.query(
        `INSERT INTO spins (session_id, table_id, number, color, parity, dozen, col, sector_a3, sector_a4, spin_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [sessionId, tableId, num, cls.color, cls.parity, cls.dozen, cls.col, cls.sector_a3, cls.sector_a4, spinOrder]
      );

      // Full params: include lockedSystem, vecinosBettingType, axisProgressionStep
      const betResult = computeActiveBetResult(
        spinsInSession, cls, passTarget, systemType, bettingMode,
        mirrorMode, lockedSystem, vecinosBettingType, axisProgressionStep
      );
      if (betResult) {
        // Advance progression step for next spin
        if (betResult.systemType === 'AXIS') {
          if (betResult.result === 'win') axisProgressionStep = 1;
          else axisProgressionStep = Math.min(axisProgressionStep + 1, 20);
        }
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

    // ── Post-commit: update analytics (best-effort, outside transaction) ──────
    try {
      const allSpins = await pool.query(
        'SELECT number FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
        [sessionId]
      );
      await updateWindowAnalytics(pool, sessionId, tableId, allSpins.rows, 'append');
    } catch (_) { /* non-fatal */ }

    res.status(201).json({ inserted: inserted.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
