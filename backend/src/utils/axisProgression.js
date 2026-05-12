// ═══════════════════════════════════════════════════════════════════════════════
// AXIS6STARS PROGRESSION — Backend port (CommonJS)
// Mirror of frontend/src/strategies/axis6stars/moneyManagement/axisProgression.js
// Keep in sync with frontend version.
// ═══════════════════════════════════════════════════════════════════════════════

const AXIS6_PROGRESSIVE_TABLE = [
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

const MAX_PROGRESSION_STEP = 20;

/**
 * Get progression table entry for a given step (1–20).
 */
function getProgressionEntry(step) {
  const idx = Math.max(0, Math.min(step - 1, MAX_PROGRESSION_STEP - 1));
  return AXIS6_PROGRESSIVE_TABLE[idx];
}

/**
 * Compute current progression step from AXIS bet result rows.
 * Each row must have a `result` field ('win' | 'loss').
 * Win resets to 1, loss advances (+1, max 20).
 *
 * @param {Array<{result: string}>} axisResults - chronological AXIS results
 * @returns {number} step (1–20)
 */
function computeProgressionStep(axisResults) {
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

module.exports = {
  AXIS6_PROGRESSIVE_TABLE,
  MAX_PROGRESSION_STEP,
  getProgressionEntry,
  computeProgressionStep,
};
