// ═══════════════════════════════════════════════════════════════════════════════
// AXIS6STARS PROGRESSION — Official 20-step money management system
//
// NOT martingale · NOT fibonacci · NOT d'alembert · NOT paroli.
// Custom recovery table designed for the AXIS 6×6 grid system.
//
// Rules:
//   - Each loss spin  → advance one step (capped at 20)
//   - Each win spin   → reset to step 1
//   - Progression is SESSION-LEVEL, not per-sector
//     (continues across H/V/Eclipse sector switches)
//
// Step interpretation:
//   chips     = stake per number
//   totalBet  = chips × 6 (reference for standard H/V bet)
//   exposure  = cumulative chips wagered since session start (worst case)
//   expectedProfit = net profit if win occurs on this step (after full recovery)
// ═══════════════════════════════════════════════════════════════════════════════

export const AXIS6_PROGRESSIVE_TABLE = [
  { step:  1, chips:  1, totalBet:   6, exposure:    6, expectedProfit:  30 },
  { step:  2, chips:  1, totalBet:   6, exposure:   12, expectedProfit:  24 },
  { step:  3, chips:  1, totalBet:   6, exposure:   18, expectedProfit:  18 },
  { step:  4, chips:  1, totalBet:   6, exposure:   24, expectedProfit:  12 },
  { step:  5, chips:  2, totalBet:  12, exposure:   36, expectedProfit:  36 },
  { step:  6, chips:  2, totalBet:  12, exposure:   48, expectedProfit:  24 },
  { step:  7, chips:  2, totalBet:  12, exposure:   60, expectedProfit:  12 },
  { step:  8, chips:  3, totalBet:  18, exposure:   78, expectedProfit:  30 },
  { step:  9, chips:  3, totalBet:  18, exposure:   96, expectedProfit:  12 },
  { step: 10, chips:  4, totalBet:  24, exposure:  120, expectedProfit:  24 },
  { step: 11, chips:  5, totalBet:  30, exposure:  150, expectedProfit:  30 },
  { step: 12, chips:  6, totalBet:  36, exposure:  186, expectedProfit:  30 },
  { step: 13, chips:  8, totalBet:  48, exposure:  234, expectedProfit:  54 },
  { step: 14, chips: 10, totalBet:  60, exposure:  294, expectedProfit:  66 },
  { step: 15, chips: 12, totalBet:  72, exposure:  366, expectedProfit:  66 },
  { step: 16, chips: 15, totalBet:  90, exposure:  456, expectedProfit:  84 },
  { step: 17, chips: 18, totalBet: 108, exposure:  564, expectedProfit:  84 },
  { step: 18, chips: 22, totalBet: 132, exposure:  696, expectedProfit:  96 },
  { step: 19, chips: 27, totalBet: 162, exposure:  858, expectedProfit: 114 },
  { step: 20, chips: 33, totalBet: 198, exposure: 1056, expectedProfit: 132 },
];

export const MAX_PROGRESSION_STEP = AXIS6_PROGRESSIVE_TABLE.length; // 20

// Total possible exposure if all 20 steps are lost
export const TOTAL_PROGRESSION_EXPOSURE = AXIS6_PROGRESSIVE_TABLE[19].exposure; // 1056

// ─── Table lookups ────────────────────────────────────────────────────────────

/**
 * Get progression table entry for a given step (1–20).
 * Returns step 20 entry if step > 20.
 */
export function getProgressionEntry(step) {
  const idx = Math.max(0, Math.min(step - 1, MAX_PROGRESSION_STEP - 1));
  return AXIS6_PROGRESSIVE_TABLE[idx];
}

// ─── Core state computation ───────────────────────────────────────────────────

/**
 * Compute the current progression step from an ordered array of AXIS bet results.
 *
 * Rules:
 *   - Starts at step 1 (before any bets)
 *   - Each loss spin → step + 1 (max 20)
 *   - Each win spin  → reset to step 1
 *   - Sector switches DO NOT reset the progression
 *
 * @param {Array<{result: 'win'|'loss'}>} axisResults - chronological AXIS results
 * @returns {number} Current step to use for the NEXT bet (1–20)
 */
export function computeProgressionStep(axisResults) {
  let step = 1;
  for (const r of axisResults) {
    if (r.result === 'win') {
      step = 1;
    } else {
      step = Math.min(step + 1, MAX_PROGRESSION_STEP);
    }
  }
  return step;
}

// ─── Financial computation ────────────────────────────────────────────────────

/**
 * Compute actual bet financials using progression stake.
 * Handles both standard H/V bets (6 numbers) and Eclipse bets (4–5 numbers).
 *
 * European roulette P&L with stake s per number, n numbers covered:
 *   Win:  +s × (36 − n)   [win gross s×36, lose s×(n−1) on others]
 *   Loss: −s × n           [lose all n chips]
 *
 * @param {boolean} isWin
 * @param {number}  betCount       - actual numbers covered (betNumbers.length)
 * @param {number}  stakePerNumber - chips per number from progression table
 * @returns {{ totalBet, profit, payout }}
 */
export function computeProgressionBetFinancials(isWin, betCount, stakePerNumber) {
  const totalBet = stakePerNumber * betCount;
  const profit   = isWin
    ? stakePerNumber * (36 - betCount)
    : -totalBet;
  const payout   = isWin ? stakePerNumber * 36 : 0;
  return { totalBet, profit, payout };
}

// ─── Full output for UI consumption ──────────────────────────────────────────

/**
 * Build the complete progression state snapshot for display.
 *
 * @param {Array}  axisResults - array of {result, profit, bet_chips, ...} AXIS results
 * @param {number} betCount    - numbers covered in the active state (default 6)
 * @returns {object}           Full progression state
 */
export function computeProgressionOutput(axisResults, betCount = 6) {
  const step  = computeProgressionStep(axisResults);
  const entry = getProgressionEntry(step);
  const next  = getProgressionEntry(step + 1);

  const { totalBet, profit: winProfit } =
    computeProgressionBetFinancials(true, betCount, entry.chips);

  // Consecutive losses from the end (current losing streak in progress)
  let consecutiveLosses = 0;
  for (let i = axisResults.length - 1; i >= 0; i--) {
    if (axisResults[i].result === 'loss') consecutiveLosses++;
    else break;
  }

  const wins   = axisResults.filter(r => r.result === 'win').length;
  const losses = axisResults.filter(r => r.result === 'loss').length;

  return {
    // Current step
    step,
    chipsPerNumber:    entry.chips,
    totalBet,                                    // actual (uses real betCount)
    tableReferenceTotalBet: entry.totalBet,      // table's 6-number reference
    accumulatedExposure:    entry.exposure,
    expectedRecoveryProfit: entry.expectedProfit,
    winProfit,                                   // net profit if win THIS spin

    // Next step preview (if this spin is a loss)
    nextStep:         Math.min(step + 1, MAX_PROGRESSION_STEP),
    nextStepChips:    next.chips,
    nextStepTotalBet: next.chips * betCount,

    // Session metrics
    consecutiveLosses,
    isMaxLevel:    step >= MAX_PROGRESSION_STEP,
    totalBetSpins: axisResults.length,
    wins,
    losses,
  };
}
