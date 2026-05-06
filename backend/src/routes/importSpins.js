// ─── POST /api/import/:sessionId ─────────────────────────────────────────────
// Importación masiva de historial para una sesión.
// Reutiliza exactamente la misma lógica que /spins/bulk.
// Después recalcula hot_windows + table_memory para todos los bloques de 36.

const express     = require('express');
const router      = express.Router();
const pool        = require('../db');
const { classifyNumber }   = require('../utils/roulette');
const { computeHotNumbers } = require('../utils/hotNumbers');

// ─── POST /api/import/:sessionId ──────────────────────────────────────────────
router.post('/:sessionId', async (req, res) => {
  const sessionId     = parseInt(req.params.sessionId);
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
  console.log(`[IMPORT] First historical: ${clean[0]}  |  Last historical: ${clean[clean.length - 1]}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
      console.log(`[IMPORT] Existing spins deleted for session ${sessionId}`);
    }

    // Cargar spins ya existentes en sesión (si se agrega, no reemplaza)
    let spinsInSession = (
      await client.query('SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC', [sessionId])
    ).rows;

    // Insertar en bulk dentro de la transacción
    const insertedIds = [];
    for (const num of clean) {
      const cls      = classifyNumber(num);
      const spinOrder = spinsInSession.length;

      const { rows: [spin] } = await client.query(
        `INSERT INTO spins (session_id, table_id, number, color, parity, dozen, col, sector_a3, sector_a4, spin_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [sessionId, tableId, num, cls.color, cls.parity, cls.dozen, cls.col, cls.sector_a3, cls.sector_a4, spinOrder]
      );

      spinsInSession.push(spin);
      insertedIds.push(spin.id);
    }

    await client.query('COMMIT');
    console.log(`[IMPORT] Bulk insert completed — ${insertedIds.length} spins`);

    // ── Recalcular hot_windows + table_memory para todos los bloques de 36 ──
    // (fuera de la transacción para no bloquear; errores no fatales)
    try {
      // Traer todos los spins de la sesión en orden
      const allSpins = (
        await pool.query('SELECT * FROM spins WHERE session_id = $1 ORDER BY spin_order ASC', [sessionId])
      ).rows;

      const totalSpins = allSpins.length;
      const totalBlocks = Math.floor(totalSpins / 36);

      // Si reemplazamos, limpiar los hot_windows previos de esta sesión
      if (replaceExisting) {
        await pool.query('DELETE FROM hot_windows WHERE session_id = $1', [sessionId]);
      }

      for (let block = 1; block <= totalBlocks; block++) {
        const slice36 = allSpins.slice((block - 1) * 36, block * 36);
        const nums36  = slice36.map(s => s.number);
        const hot     = computeHotNumbers(nums36);

        // Guardar hot_window (ON CONFLICT DO NOTHING: no duplicar si ya existe)
        await pool.query(
          `INSERT INTO hot_windows (table_id, session_id, window_index, numbers)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [tableId, sessionId, block, JSON.stringify(hot)]
        );

        // Upsert table_memory incremental
        if (hot.length > 0) {
          const hotNums   = hot.map(h => h.num);
          const hotCounts = hot.map(h => h.count);
          await pool.query(
            `INSERT INTO table_memory (table_id, number, hits)
             SELECT $1, num, cnt
               FROM unnest($2::int[], $3::int[]) AS t(num, cnt)
             ON CONFLICT (table_id, number)
             DO UPDATE SET
               hits       = table_memory.hits + EXCLUDED.hits,
               updated_at = NOW()`,
            [tableId, hotNums, hotCounts]
          );
        }
      }

      console.log(`[IMPORT] Analytics recalculated — ${totalBlocks} blocks of 36`);
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
