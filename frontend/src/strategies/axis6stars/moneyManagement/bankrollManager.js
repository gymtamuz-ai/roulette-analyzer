// ═══════════════════════════════════════════════════════════════════════════════
// BANKROLL MANAGER — Exposure tracking and stake allocation recommendations
// ═══════════════════════════════════════════════════════════════════════════════

import {
  getProgressionEntry,
  TOTAL_PROGRESSION_EXPOSURE,
} from './axisProgression';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum recommended bankroll to safely run the full 20-step progression.
 * = total exposure × 1.1 safety buffer.
 */
export const RECOMMENDED_BANKROLL_CHIPS = Math.ceil(TOTAL_PROGRESSION_EXPOSURE * 1.1); // 1162

// ─── Running balance ──────────────────────────────────────────────────────────

/**
 * Compute running balance from AXIS results (assumes progression profits).
 */
export function computeRunningBalance(axisResults) {
  return axisResults.reduce((sum, r) => sum + (r.profit ?? 0), 0);
}

/**
 * Compute peak balance and max drawdown from AXIS results.
 */
export function computeDrawdownFromResults(axisResults) {
  let balance = 0, peak = 0, maxDrawdown = 0;
  for (const r of axisResults) {
    balance += r.profit ?? 0;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  return { balance, peak, maxDrawdown };
}

// ─── Bankroll recommendations ─────────────────────────────────────────────────

/**
 * Compute bankroll adequacy and recommended exposure for the current step.
 *
 * @param {number} step          - current progression step (1–20)
 * @param {number} bankrollChips - total chips available (0 = unknown)
 * @param {number} betCount      - numbers covered (default 6)
 */
export function getBankrollRecommendation(step, bankrollChips = 0, betCount = 6) {
  const entry          = getProgressionEntry(step);
  const thisBet        = entry.chips * betCount;
  const remainingSteps = 20 - step;

  // Remaining exposure needed from this step to the end
  const remainingExposure = TOTAL_PROGRESSION_EXPOSURE - (step > 1 ? getProgressionEntry(step - 1).exposure : 0);

  const bankrollCoverage = bankrollChips > 0
    ? Math.round(bankrollChips / RECOMMENDED_BANKROLL_CHIPS * 100)
    : null;

  const canCoverFull  = bankrollChips >= TOTAL_PROGRESSION_EXPOSURE;
  const canCoverRest  = bankrollChips >= remainingExposure;

  return {
    step,
    chipsPerNumber:        entry.chips,
    totalBet:              thisBet,
    exposure:              entry.exposure,
    remainingExposure,
    remainingSteps,
    recommendedBankroll:   RECOMMENDED_BANKROLL_CHIPS,
    bankrollCoverage,
    canCoverFullTable:     canCoverFull,
    canCoverRemaining:     canCoverRest,
    adequacy: bankrollChips === 0 ? null
            : canCoverFull       ? 'safe'
            : canCoverRest       ? 'partial'
            : 'insufficient',
  };
}
