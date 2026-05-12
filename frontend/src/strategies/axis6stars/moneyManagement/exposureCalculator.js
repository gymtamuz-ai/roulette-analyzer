// ═══════════════════════════════════════════════════════════════════════════════
// EXPOSURE CALCULATOR — Per-step and cumulative exposure analysis
// ═══════════════════════════════════════════════════════════════════════════════

import {
  AXIS6_PROGRESSIVE_TABLE,
  getProgressionEntry,
  TOTAL_PROGRESSION_EXPOSURE,
} from './axisProgression';

// ─── Static lookups ───────────────────────────────────────────────────────────

/** Cumulative exposure from the table for a given step (1–20). */
export function getAccumulatedExposure(step) {
  return getProgressionEntry(step).exposure;
}

/** Incremental exposure added on the given step (this spin's total bet, per table). */
export function getIncrementalExposure(step) {
  if (step <= 1) return AXIS6_PROGRESSIVE_TABLE[0].totalBet; // 6
  return getProgressionEntry(step).exposure - getProgressionEntry(step - 1).exposure;
}

/** Percentage of total possible exposure consumed by this step. */
export function getExposurePercent(step) {
  return Math.round(getProgressionEntry(step).exposure / TOTAL_PROGRESSION_EXPOSURE * 100);
}

// ─── Expected recovery ────────────────────────────────────────────────────────

/**
 * Expected net profit if win occurs on a given step, given actual betCount.
 * Derived from progression financials (not the table's 6-number reference).
 *
 * @param {number} step
 * @param {number} betCount - actual numbers covered (6 for H/V, 4–5 for Eclipse)
 */
export function getExpectedRecoveryProfit(step, betCount = 6) {
  const entry      = getProgressionEntry(step);
  const prevExposure = step > 1 ? getProgressionEntry(step - 1).exposure : 0;
  // Actual win profit on this spin
  const spinProfit = entry.chips * (36 - betCount);
  // Net after recovering all prior exposure
  return spinProfit - prevExposure;
}

// ─── Live exposure from results ───────────────────────────────────────────────

/**
 * Compute live (running) exposure since last win.
 * Exposure resets on every win (chips recovered via payout).
 *
 * @param {Array<{result, bet_chips?, chips?}>} axisResults
 * @returns {number} chips wagered since last win
 */
export function computeLiveExposure(axisResults) {
  let liveExposure = 0;
  for (const r of axisResults) {
    if (r.result === 'win') {
      liveExposure = 0;
    } else {
      liveExposure += (r.bet_chips ?? r.chips ?? 6);
    }
  }
  return liveExposure;
}

// ─── Full exposure table (for UI rendering) ───────────────────────────────────

/**
 * Return full 20-row exposure breakdown with actual figures for a given betCount.
 * Useful for rendering the complete progression table in UI.
 *
 * @param {number} betCount - 6 for H/V, 4–5 for Eclipse (default 6)
 */
export function getFullExposureTable(betCount = 6) {
  let runningExposure = 0;
  return AXIS6_PROGRESSIVE_TABLE.map((entry, i) => {
    const actualTotalBet    = entry.chips * betCount;
    const prevExposure      = i > 0 ? AXIS6_PROGRESSIVE_TABLE[i - 1].exposure : 0;
    const actualWinProfit   = entry.chips * (36 - betCount);
    const actualNetRecovery = actualWinProfit - prevExposure;
    runningExposure        += actualTotalBet; // running (ignores table exposure column)

    return {
      ...entry,
      actualTotalBet,
      actualWinProfit,
      actualNetRecovery,
      incremental: entry.exposure - prevExposure,
    };
  });
}
