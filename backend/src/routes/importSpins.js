// ─── POST /api/import/:sessionId ─────────────────────────────────────────────
// Importación masiva de historial para una sesión.
//
// PIPELINE UNIFICADO: usa los mismos helpers que spins.js para garantizar:
//   • spin_order atómico y sin race conditions (advisory lock)
//   • hot_windows idempotentes (sin double-counting)
//   • table_memory consistente con el resto del sistema
//
// NOTA: El import NO computa bet_results por diseño — es ingreso de historial raw.
// Para replay con estrategias, usar POST /api/spins/bulk.

const express    = require('express');
const router     = express.Router();
const pool       = require('../db');
const { classifyNumber }          = require('../utils/roulette');
const { acquireSessionLock, nextSpinOrder, updateWindowAnalytics } = require('../utils/spinHelpers');

// ─── POST /api/import/:sessionId ──────────────────────────────────────────────
router.post('/:sessionId', async (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const { numbers, replaceExisting = false } = req.body;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'numbers[] requerido y no puede estar vacío' });
  }

  // Validar todos los números antes de empezar
  const clean = [];
  for (const n of numbers) {
    const num = parseInt(n);
    if (isNaN(num) || num < 0 || num > 36) {
      return res.status(400).json({ error: `Número inválido: ${n}` });
    }
    clean.push(num);
  }

  console.log(`[IMPORT] sessionId=${sessionId} | total=${clean.length} | replaceExisting=${replaceExisting}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Advisory lock: serializa imports concurrentes para esta sesión ─────────
    await acquireSessionLock(client, sessionId);

    // Verificar sesión y obtener tableId
    const sessionRes = await client.query(
      'SELECT table_id FROM sessions WHERE id = $1', [sessionId]
    );
    if (!sessionRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sesión no encontrada' });
    }
    const tableId = sessionRes.rows[0].table_id;

    // Si replaceExisting: borrar spins + results previos de la sesión
    if (replaceExisting) {
      await client.query('DELETE FROM session_results WHERE session_id = $1', [sessionId]);
      await client.query('DELETE FROM spins WHERE session_id = $1', [sessionId]);
      // IMPORTANTE: también resetear table_memory para la contribución de esta sesión
      // Lo hacemos eliminando los hot_windows de esta sesión y recalculando al final
      await client.query('DELETE FROM hot_windows WHERE session_id = $1', [sessionId]);
      console.log(`[IMPORT] Existing data cleared for session ${sessionId}`);
    }

    // Insertar en bulk dentro de la transacción
    // spin_order es secuencial in-loop — seguro con advisory lock
    const currentCount = parseInt(
      (await client.query(
        'SELECT COUNT(*) as c FROM spins WHERE session_id = $1', [sessionId]
      )).rows[0].c
    );

    const insertedIds = [];
    for (let i = 0; i < clean.length; i++) {
      const num      = clean[i];
      const cls      = classifyNumber(num);
      const spinOrder = currentCount + i;  // advisory lock garantiza que no hay race

      const { rows: [spin] } = await client.query(
        `INSERT INTO spins
           (session_id, table_id, number, color, parity, dozen, col, sector_a3, sector_a4, spin_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [sessionId, tableId, num, cls.color, cls.parity, cls.dozen, cls.col, cls.sector_a3, cls.sector_a4, spinOrder]
      );
      insertedIds.push(spin.id);
    }

    await client.query('COMMIT');
    console.log(`[IMPORT] ${insertedIds.length} spins inserted for session ${sessionId}`);

    // ── Post-commit: recalcular analytics (idempotente, sin double-counting) ──
    // updateWindowAnalytics solo procesa bloques nuevos — no re-cuenta los ya existentes
    try {
      const { rows: allSpins } = await pool.query(
        'SELECT number FROM spins WHERE session_id = $1 ORDER BY spin_order ASC',
        [sessionId]
      );

      const mode = replaceExisting ? 'replace' : 'append';
      await updateWindowAnalytics(pool, sessionId, tableId, allSpins, mode);

      const totalBlocks = Math.floor(allSpins.length / 36);
      console.log(`[IMPORT] Analytics updated — ${totalBlocks} blocks (mode=${mode})`);
    } catch (analyticsErr) {
      // No fatal — los spins están guardados igual
      console.error('[IMPORT] Analytics warning:', analyticsErr.message);
    }

    res.status(201).json({
      inserted: insertedIds.length,
      message:  `${insertedIds.length} números importados correctamente`,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[IMPORT] Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
