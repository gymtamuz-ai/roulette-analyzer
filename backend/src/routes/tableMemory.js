const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// Frecuencia teórica europea: 1 número de 37 posibles
const THEORETICAL_PCT = 100 / 37; // 2.7027...%

/**
 * GET /api/table-memory/:tableId
 *
 * Devuelve el acumulado histórico de esa mesa, calculado dinámicamente
 * desde hot_windows (así refleja exactamente los bloques vigentes —
 * los hot_windows se borran en cascada al borrar sesiones, por lo que
 * nunca hay datos fantasma de sesiones eliminadas).
 *
 * {
 *   totalSpins,   — totalBlocks × 36
 *   totalBlocks,  — bloques de 36 completados vigentes
 *   numbers: [{ number, hits, percentage, deviation }]  — los 37 números
 * }
 */
router.get('/:tableId', async (req, res) => {
  const tableId = parseInt(req.params.tableId, 10);
  if (isNaN(tableId)) return res.status(400).json({ error: 'tableId must be a number' });

  try {
    // Leer todos los bloques de esta mesa directamente desde hot_windows
    const { rows: windows } = await pool.query(
      `SELECT numbers FROM hot_windows WHERE table_id = $1`,
      [tableId]
    );

    const totalBlocks = windows.length;
    const totalSpins  = totalBlocks * 36; // exacto: cada bloque tiene exactamente 36 tiradas

    // Agregar hits por número a partir de cada bloque
    const hitsMap = {};
    for (const { numbers } of windows) {
      // numbers puede llegar como objeto JS (JSONB) o como string según el driver
      const parsed = typeof numbers === 'string' ? JSON.parse(numbers) : numbers;
      for (const { num, count } of parsed) {
        hitsMap[num] = (hitsMap[num] || 0) + count;
      }
    }

    // Construir respuesta para los 37 números (0-36)
    const numbers = [];
    for (let n = 0; n <= 36; n++) {
      const hits       = hitsMap[n] || 0;
      const percentage = totalSpins > 0
        ? parseFloat(((hits / totalSpins) * 100).toFixed(2))
        : 0;
      const deviation  = parseFloat((percentage - THEORETICAL_PCT).toFixed(2));
      numbers.push({ number: n, hits, percentage, deviation });
    }
    // Ordenar por desviación descendente (los más calientes primero)
    numbers.sort((a, b) => b.deviation - a.deviation || a.number - b.number);

    res.json({ totalSpins, totalBlocks, numbers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
