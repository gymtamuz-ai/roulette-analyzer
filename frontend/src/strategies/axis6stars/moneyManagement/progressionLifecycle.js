// ═══════════════════════════════════════════════════════════════════════════════
// AXIS6STARS PROGRESSION LIFECYCLE MANAGER
//
// Defines and computes the SERIES-LEVEL lifecycle of an AXIS6Stars progression.
//
// ────────────────────────────────────────────────────────────────────────────
// SERIES vs CYCLE — CRITICAL DISTINCTION
// ────────────────────────────────────────────────────────────────────────────
//
//   TRIGGER CYCLE  = one 4-spin betting window for a single H/V/Eclipse trigger.
//                    Tracked by axis.js → cyclesWon / cyclesAborted.
//                    Used for per-sector axis_memory and intelligence scoring.
//                    NOT the unit of "won" or "lost" for the player.
//
//   PROGRESSION SERIES = the full session-level recovery attempt.
//                    Spans ALL trigger cycles and sector switches.
//                    Ends ONLY when:
//                      WIN at any step    → RECOVERED (reset to step 1)
//                      LOSS at step 20    → FAILED    (reset to step 1)
//
// ────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATES
// ────────────────────────────────────────────────────────────────────────────
//
//   IDLE      — no bet spins have been placed yet
//   ACTIVE    — losses accumulating, step > 1, series still alive
//   RECOVERED — last bet spin was a WIN → series successfully recovered
//   FAILED    — last bet spin was a LOSS at step 20 → full progression exhausted
//
// ────────────────────────────────────────────────────────────────────────────
// WHAT DOES NOT ABORT A SERIES
// ────────────────────────────────────────────────────────────────────────────
//   ❌ session PnL going negative
//   ❌ trigger-cycle expiry (4 spins without hit)
//   ❌ sector switching (H→V→Eclipse, etc.)
//   ❌ drawdown
//   ❌ any number of partial losses < step 20
//
// ═══════════════════════════════════════════════════════════════════════════════

import { MAX_PROGRESSION_STEP, getProgressionEntry } from './axisProgression';

// ─── State constants ──────────────────────────────────────────────────────────

export const LIFECYCLE_STATES = {
  IDLE:      { state: 'IDLE',      label: 'Sin apuestas',        color: 'text-gray-500',   bg: 'bg-gray-800/40',    border: 'border-gray-700',   icon: '⏸' },
  ACTIVE:    { state: 'ACTIVE',    label: 'Serie activa',        color: 'text-blue-300',   bg: 'bg-blue-900/20',    border: 'border-blue-700',   icon: '▶' },
  RECOVERED: { state: 'RECOVERED', label: 'Recuperada ✅',       color: 'text-green-300',  bg: 'bg-green-900/20',   border: 'border-green-600',  icon: '✅' },
  FAILED:    { state: 'FAILED',    label: 'Fallida ❌',           color: 'text-red-300',    bg: 'bg-red-900/20',     border: 'border-red-600',    icon: '❌' },
};

// ─── Core lifecycle computation ───────────────────────────────────────────────

/**
 * Compute the complete progression series lifecycle from AXIS bet results.
 *
 * Each element of axisResults must have:
 *   result: 'win' | 'loss'
 *
 * Algorithm:
 *   - step starts at 1
 *   - WIN at any step    → RECOVERED: reset step to 1, increment recoveredSeries
 *   - LOSS at step < 20  → ACTIVE: advance step
 *   - LOSS at step 20    → FAILED: reset step to 1, increment failedSeries
 *
 * @param {Array<{result: 'win'|'loss', profit?: number}>} axisResults
 * @returns {ProgressionLifecycle}
 */
export function computeProgressionLifecycle(axisResults) {
  let step            = 1;
  let recoveredSeries = 0;
  let failedSeries    = 0;
  let lastOutcome     = null; // null | 'RECOVERED' | 'FAILED' | 'ACTIVE'

  // Per-series tracking
  const completedSeries = []; // { outcome, recoveryStep, length (spins), profit }
  let seriesStart    = 0;
  let seriesProfit   = 0;

  const recoverSteps = []; // step at which each recovery happened
  const seriesLengths = []; // number of bet spins per completed series

  for (let i = 0; i < axisResults.length; i++) {
    const r       = axisResults[i];
    const betStep = step; // step used for THIS bet
    seriesProfit += (r.profit ?? 0);

    if (r.result === 'win') {
      // ── RECOVERED ──────────────────────────────────────────────────────────
      recoveredSeries++;
      recoverSteps.push(betStep);
      completedSeries.push({
        outcome:      'RECOVERED',
        recoveryStep: betStep,
        length:       i - seriesStart + 1,
        profit:       seriesProfit,
      });
      seriesLengths.push(i - seriesStart + 1);
      step         = 1;
      lastOutcome  = 'RECOVERED';
      seriesStart  = i + 1;
      seriesProfit = 0;

    } else {
      if (betStep >= MAX_PROGRESSION_STEP) {
        // ── FAILED ──────────────────────────────────────────────────────────
        failedSeries++;
        completedSeries.push({
          outcome:      'FAILED',
          recoveryStep: null,
          length:       i - seriesStart + 1,
          profit:       seriesProfit,
        });
        seriesLengths.push(i - seriesStart + 1);
        step         = 1;
        lastOutcome  = 'FAILED';
        seriesStart  = i + 1;
        seriesProfit = 0;

      } else {
        // ── ACTIVE: loss, series continues ──────────────────────────────────
        step        = betStep + 1;
        lastOutcome = 'ACTIVE';
      }
    }
  }

  // ── Current series state ──────────────────────────────────────────────────
  const currentSeriesState = lastOutcome === null      ? 'IDLE'
                           : lastOutcome === 'RECOVERED'? 'RECOVERED'
                           : lastOutcome === 'FAILED'  ? 'FAILED'
                           : 'ACTIVE'; // ACTIVE: mid-series with losses

  const currentLifecycle = LIFECYCLE_STATES[currentSeriesState];

  // ── Aggregate metrics ──────────────────────────────────────────────────────
  const totalCompleted = recoveredSeries + failedSeries;
  const recoveryRate   = totalCompleted > 0
    ? Math.round(recoveredSeries / totalCompleted * 100)
    : null;

  const averageRecoveryStep = recoverSteps.length > 0
    ? parseFloat((recoverSteps.reduce((a, b) => a + b, 0) / recoverSteps.length).toFixed(1))
    : null;

  const maxStepBeforeRecovery = recoverSteps.length > 0
    ? Math.max(...recoverSteps)
    : null;

  // Average spins per series
  const avgSeriesLength = seriesLengths.length > 0
    ? parseFloat((seriesLengths.reduce((a, b) => a + b, 0) / seriesLengths.length).toFixed(1))
    : null;

  // Current series: losses in this run (step - 1 = consecutive losses since last reset)
  const currentSeriesLosses = currentSeriesState === 'ACTIVE' ? step - 1 : 0;

  // Recovery pending for ACTIVE series: expectedProfit if win NOW
  const currentEntry         = getProgressionEntry(step);
  const recoveryPendingProfit = currentSeriesState === 'ACTIVE' ? currentEntry.expectedProfit : null;
  const accumulatedExposure   = currentSeriesState === 'ACTIVE' ? currentEntry.exposure : 0;

  return {
    // ── Current series ───────────────────────────────────────────────────────
    currentSeriesState,
    currentLifecycle,
    currentStep:            step,
    currentSeriesLosses,
    recoveryPendingProfit,
    accumulatedExposure,

    // ── Historical series counts ──────────────────────────────────────────────
    recoveredSeries,
    failedSeries,
    totalCompleted,
    recoveryRate,

    // ── Analysis ─────────────────────────────────────────────────────────────
    averageRecoveryStep,
    maxStepBeforeRecovery,
    avgSeriesLength,
    recoverSteps,
    completedSeries,        // full series history (for debug/sparkline)

    // ── Convenience ──────────────────────────────────────────────────────────
    totalBetSpins: axisResults.length,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Filters the full results array to only AXIS bet results.
 * Works with both snake_case (DB) and camelCase (local state) keys.
 */
export function filterAxisResults(results) {
  return results.filter(r => (r.system_type || r.systemType) === 'AXIS');
}
