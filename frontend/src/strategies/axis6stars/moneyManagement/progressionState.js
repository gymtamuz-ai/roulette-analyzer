// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESSION STATE — Full session-level state tracker
// Derives comprehensive progression metadata from results history.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  computeProgressionStep,
  getProgressionEntry,
  AXIS6_PROGRESSIVE_TABLE,
  MAX_PROGRESSION_STEP,
} from './axisProgression';

// ─── Phase classification ─────────────────────────────────────────────────────

/**
 * Get descriptive phase label for the current step.
 * 5 phases reflecting risk tiers in the progression table.
 */
export function getProgressionPhase(step) {
  if (step <= 4)  return { phase: 'Fase 1', color: 'text-green-400',  border: 'border-green-700',  desc: 'Exploración — riesgo mínimo'       };
  if (step <= 7)  return { phase: 'Fase 2', color: 'text-yellow-400', border: 'border-yellow-700', desc: 'Recuperación moderada'              };
  if (step <= 9)  return { phase: 'Fase 3', color: 'text-orange-400', border: 'border-orange-700', desc: 'Recuperación activa'                };
  if (step <= 12) return { phase: 'Fase 4', color: 'text-red-400',    border: 'border-red-700',    desc: 'Alta exposición'                   };
  return           { phase: 'Fase 5', color: 'text-red-300',          border: 'border-red-500',    desc: 'Zona crítica — máxima exposición'  };
}

// ─── Full state builder ───────────────────────────────────────────────────────

/**
 * Build a comprehensive progression state snapshot from AXIS results.
 *
 * @param {Array<{result: 'win'|'loss', profit?: number, bet_chips?: number}>} axisResults
 * @returns {object}
 */
export function buildProgressionState(axisResults) {
  const step  = computeProgressionStep(axisResults);
  const entry = getProgressionEntry(step);
  const phase = getProgressionPhase(step);

  // ── Step trace ───────────────────────────────────────────────────────────
  // Walk through results, record step at each bet spin
  let traceStep = 1;
  const stepTrace = [];
  for (const r of axisResults) {
    stepTrace.push({ step: traceStep, result: r.result, profit: r.profit ?? 0 });
    if (r.result === 'win') traceStep = 1;
    else                    traceStep = Math.min(traceStep + 1, MAX_PROGRESSION_STEP);
  }

  // ── Streak analysis ──────────────────────────────────────────────────────
  let consecutiveLosses = 0;
  for (let i = axisResults.length - 1; i >= 0; i--) {
    if (axisResults[i].result === 'loss') consecutiveLosses++;
    else break;
  }

  let longestLosingRun = 0, curRun = 0;
  for (const r of axisResults) {
    if (r.result === 'loss') { curRun++; longestLosingRun = Math.max(longestLosingRun, curRun); }
    else                     curRun = 0;
  }

  // ── Session metrics ──────────────────────────────────────────────────────
  const wins   = axisResults.filter(r => r.result === 'win').length;
  const losses = axisResults.filter(r => r.result === 'loss').length;
  const resets = wins; // each win resets to step 1

  const maxStepReached = stepTrace.length > 0
    ? Math.max(...stepTrace.map(t => t.step))
    : 1;

  const totalProfit = axisResults.reduce((s, r) => s + (r.profit ?? 0), 0);

  return {
    // Core
    currentStep:       step,
    currentEntry:      entry,
    phase,

    // Streaks
    consecutiveLosses,
    longestLosingRun,

    // Session-wide
    maxStepReached,
    resets,
    totalBetSpins:   axisResults.length,
    wins,
    losses,
    totalProfit,

    // Step-by-step trace (for sparkline / debug)
    stepTrace,
  };
}

// ─── Step trace sparkline data ────────────────────────────────────────────────

/**
 * Build a compact step-level sparkline (for charting).
 * Returns last N entries of the step trace as { idx, step, result } objects.
 */
export function getStepSparkline(axisResults, maxPoints = 20) {
  const state = buildProgressionState(axisResults);
  return state.stepTrace.slice(-maxPoints).map((t, i, arr) => ({
    idx:    axisResults.length - arr.length + i,
    step:   t.step,
    result: t.result,
    profit: t.profit,
  }));
}
