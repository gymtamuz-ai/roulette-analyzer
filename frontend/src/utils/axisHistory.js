// ═══════════════════════════════════════════════════════════════════════════════
// AXIS HISTORY — clasificación y convergencia usando axis_memory
// ═══════════════════════════════════════════════════════════════════════════════

import { computeAxisState } from './axis';

// ─── Thresholds ───────────────────────────────────────────────────────────────
const MIN_CYCLES_FOR_CLASSIFICATION = 8;
const HOT_WINRATE                   = 0.55;   // >55% → HOT
const COLD_ABORT_RATE               = 0.65;   // >65% aborts → COLD
const SLEEPING_SPINS                = 28;      // >28 spins sin aparecer → SLEEPING

// ─── Temporal decay ───────────────────────────────────────────────────────────
// Basado en last_seen_at. Mesas activas = 1 sesión/día ≈ 300 spins/día.
// < 1 día ≈ últimas ~100 bolas → peso 1.0
// 1-7 días → peso 0.6
// > 7 días → peso 0.3
export function computeDecayWeight(lastSeenAt) {
  if (!lastSeenAt) return 0.3;
  const diffMs   = Date.now() - new Date(lastSeenAt).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1)  return 1.0;
  if (diffDays < 7)  return 0.6;
  return 0.3;
}

// ─── Clasificar un sector a partir de su fila en axis_memory ─────────────────
// lastSeenAgo viene del estado vivo (sectorStats del axisState actual)
export function classifyAxisSector(memoryRow, lastSeenAgo = null, isCurrentlyTriggered = false) {
  const isSleeping = lastSeenAgo !== null && lastSeenAgo > SLEEPING_SPINS;

  if (isSleeping) {
    return isCurrentlyTriggered ? 'WAKEUP' : 'SLEEPING';
  }

  if (!memoryRow || memoryRow.total_cycles < MIN_CYCLES_FOR_CLASSIFICATION) {
    return 'NORMAL';
  }

  const { wins, total_cycles } = memoryRow;
  const aborts = total_cycles - wins;
  const winrate    = wins   / total_cycles;
  const abortRate  = aborts / total_cycles;

  if (winrate   > HOT_WINRATE)      return 'HOT';
  if (abortRate > COLD_ABORT_RATE)  return 'COLD';
  return 'NORMAL';
}

// ─── Lookup helper ────────────────────────────────────────────────────────────
export function findMemoryRow(memoryRows, sectorType, sectorId) {
  if (!memoryRows || !memoryRows.length) return null;
  return memoryRows.find(
    r => r.sector_type === sectorType && Number(r.sector_id) === Number(sectorId)
  ) ?? null;
}

// ─── Top sectors — los más rentables históricamente ──────────────────────────
export function getTopAxisSectors(memoryRows, limit = 3) {
  if (!memoryRows || !memoryRows.length) return [];
  return memoryRows
    .filter(r => r.total_cycles >= MIN_CYCLES_FOR_CLASSIFICATION)
    .map(r => ({
      ...r,
      winrate: r.wins / r.total_cycles,
      decay:   computeDecayWeight(r.last_seen_at),
    }))
    .sort((a, b) => (b.winrate * b.decay) - (a.winrate * a.decay))
    .slice(0, limit);
}

// ─── Convergence check ────────────────────────────────────────────────────────
// ¿El trigger actual coincide con un sector históricamente rentable?
export function getAxisConvergenceState(axisState, memoryRows) {
  if (!axisState?.isActive) return { state: 'NONE', label: null, bonus: 0 };

  const { status, triggeredH, triggeredV, aceNumber } = axisState;

  let row;
  if (status === 'TRIGGERED_ECLIPSE') {
    row = findMemoryRow(memoryRows, 'E', aceNumber);
  } else if (status === 'TRIGGERED_H') {
    row = findMemoryRow(memoryRows, 'H', triggeredH);
  } else if (status === 'TRIGGERED_V') {
    row = findMemoryRow(memoryRows, 'V', triggeredV);
  }

  if (!row || row.total_cycles < MIN_CYCLES_FOR_CLASSIFICATION) {
    return { state: 'LOCAL', label: 'sin hist.', bonus: 0, row };
  }

  const winrate   = row.wins / row.total_cycles;
  const abortRate = (row.total_cycles - row.wins) / row.total_cycles;
  const decay     = computeDecayWeight(row.last_seen_at);

  if (winrate > HOT_WINRATE) {
    return {
      state: 'CONVERGENTE', label: `hist ${(winrate * 100).toFixed(0)}%`, bonus: 20, row, decay,
    };
  }
  if (abortRate > COLD_ABORT_RATE) {
    return {
      state: 'DIVERGENTE', label: `hist fría ${(abortRate * 100).toFixed(0)}% aborts`, bonus: -15, row, decay,
    };
  }
  return { state: 'NEUTRAL', label: `hist ${(winrate * 100).toFixed(0)}%`, bonus: 5, row, decay };
}

// ─── Score AXIS para AUTO mode ────────────────────────────────────────────────
export function scoreAxisSystem(spins, memoryRows = []) {
  const axisState = computeAxisState(spins);

  if (!axisState?.isActive) {
    return { score: 0, reason: 'AXIS: sin trigger activo', convergence: null };
  }

  const { status } = axisState;
  const conv = getAxisConvergenceState(axisState, memoryRows);

  // Base: trigger activo → score 40
  let base = 40;

  // Convergence bonus/penalty
  base += conv.bonus;

  // Decay: si el historial es antiguo, reducimos la confianza
  if (conv.row && conv.decay < 1.0) {
    base = Math.round(base * (0.6 + 0.4 * conv.decay));
  }

  // ECLIPSE > H/V en base (más preciso)
  if (status === 'TRIGGERED_ECLIPSE') base += 10;

  // Penalización por ciclos abortados en sesión actual
  const { cyclesWon = 0, cyclesAborted = 0 } = axisState;
  if (cyclesAborted >= 2 && cyclesAborted > cyclesWon) base -= 20;

  const convTag = conv.state === 'CONVERGENTE' ? ' ✓hist'
                : conv.state === 'DIVERGENTE'  ? ' ⚠div'
                : conv.label                   ? ` (${conv.label})`
                : '';

  const reason = `AXIS ${status.replace('TRIGGERED_', '')}${convTag}`;

  return {
    score:       Math.max(0, Math.min(99, base)),
    reason,
    convergence: conv,
  };
}
