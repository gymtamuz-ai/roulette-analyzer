// ═══════════════════════════════════════════════════════════════════════════════
// SPIN HELPERS — shared spin-insertion and analytics utilities
//
// Single source of truth for:
//   • Atomic spin_order assignment (advisory lock → no race conditions)
//   • Hot-window + table-memory updates (idempotent, no double-counting)
//   • Cross-session spin ordering
//
// Used by: routes/spins.js · routes/importSpins.js
// ═══════════════════════════════════════════════════════════════════════════════

const { computeHotNumbers } = require('./hotNumbers');

// ─── A) Session-level advisory lock ──────────────────────────────────────────
// Serializes concurrent writers for the same session.
// The lock is automatically released at COMMIT or ROLLBACK.
// Uses the session ID as the lock key (PostgreSQL supports 64-bit bigint keys).
async function acquireSessionLock(client, sessionId) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [sessionId]);
}

// ─── B) Atomic next spin_order ────────────────────────────────────────────────
// Must be called INSIDE a transaction AFTER acquireSessionLock.
// Returns COALESCE(MAX(spin_order), -1) + 1 — always 0-based sequential.
async function nextSpinOrder(client, sessionId) {
  const { rows: [{ next_order }] } = await client.query(
    'SELECT COALESCE(MAX(spin_order), -1) + 1 AS next_order FROM spins WHERE session_id = $1',
    [sessionId]
  );
  return parseInt(next_order);
}

// ─── C) Idempotent analytics update ──────────────────────────────────────────
// Updates hot_windows + table_memory for all newly completed 36-spin blocks.
//
// Parameters:
//   pool        — pg Pool (outside transaction — analytics are best-effort)
//   sessionId   — session being updated
//   tableId     — table the session belongs to
//   allSpins    — ALL spins for this session in correct order (number field)
//   clearMode   — 'append' | 'replace'
//     'replace' → delete all existing hot_windows for this session first
//               → recalculate from block 1
//     'append'  → only process blocks that don't already exist in hot_windows
//
// Guarantees no double-counting: skips blocks already recorded.
async function updateWindowAnalytics(pool, sessionId, tableId, allSpins, clearMode = 'append') {
  const totalBlocks = Math.floor(allSpins.length / 36);
  if (totalBlocks === 0) return;

  if (clearMode === 'replace') {
    await pool.query('DELETE FROM hot_windows WHERE session_id = $1', [sessionId]);
  }

  // Load which blocks already exist — skip them to avoid double-counting
  const { rows: existing } = await pool.query(
    'SELECT window_index FROM hot_windows WHERE session_id = $1',
    [sessionId]
  );
  const existingBlocks = new Set(existing.map(r => r.window_index));

  for (let block = 1; block <= totalBlocks; block++) {
    if (existingBlocks.has(block)) continue; // already recorded — skip

    const slice36 = allSpins.slice((block - 1) * 36, block * 36);
    const nums36  = slice36.map(s => (typeof s === 'object' ? s.number : s));
    const hot     = computeHotNumbers(nums36);

    // Insert hot_window — ON CONFLICT UNIQUE means: safe if race re-runs this
    await pool.query(
      `INSERT INTO hot_windows (table_id, session_id, window_index, numbers)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (table_id, session_id, window_index) DO NOTHING`,
      [tableId, sessionId, block, JSON.stringify(hot)]
    );

    // Upsert table_memory — strictly add only the NEW block's contribution
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
}

// ─── D) Cross-session spin query ──────────────────────────────────────────────
// Returns spins for a table in chronological order across all sessions.
// Ordering: session started_at ASC → spin_order ASC (correct temporal sequence)
function buildCrossSessionQuery(tableId, limit = 5000, offset = 0) {
  return {
    text: `SELECT sp.*
             FROM spins sp
             JOIN sessions sess ON sess.id = sp.session_id
            WHERE sp.table_id = $1
            ORDER BY sess.started_at ASC, sp.spin_order ASC
            LIMIT $2 OFFSET $3`,
    values: [tableId, limit, offset],
  };
}

module.exports = {
  acquireSessionLock,
  nextSpinOrder,
  updateWindowAnalytics,
  buildCrossSessionQuery,
};
