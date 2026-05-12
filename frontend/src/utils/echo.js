// ═══════════════════════════════════════════════════════════════════════════════
// ECHO STRATEGY ENGINE
//
// Concept: numbers that repeat enter an "active" state and are tracked until
// one of them hits again (WIN) or the cycle expires (ABORT).
//
// ────────────────────────────────────────────────────────────────────────────
// ACTIVATION RULE
// ────────────────────────────────────────────────────────────────────────────
//   A number becomes ACTIVE only on its SECOND appearance in a cycle.
//   The activation spin itself is NOT a betting spin — betting begins the
//   spin AFTER the number activates.
//
// ────────────────────────────────────────────────────────────────────────────
// CYCLE LIFECYCLE
// ────────────────────────────────────────────────────────────────────────────
//   TRACKING → ACTIVE → WIN   (any active number hits)
//                     → ABORT (cycleSpins >= 36)
//   Both WIN and ABORT reset the cycle completely:
//     seenNumbers = {} · activeNumbers = [] · cycleLoss = 0 · cycleSpins = 0
//
// ────────────────────────────────────────────────────────────────────────────
// PROGRESSION (based on accumulated CYCLE loss)
// ────────────────────────────────────────────────────────────────────────────
//   Level 1 : |loss| ≤ 24   → 1 chip / active number
//   Level 2 : |loss| ≤ 59   → 2 chips / active number
//   Level 3 : |loss| ≤ 119  → 3 chips / active number
//   Level 4 : |loss| ≥ 120  → 4 chips / active number  (max)
//
// ────────────────────────────────────────────────────────────────────────────
// P&L PER BET (European roulette, 35:1 payout)
// ────────────────────────────────────────────────────────────────────────────
//   Win  : +chipsPerNumber × (36 − N)   where N = activeNumbers.length
//   Loss : −chipsPerNumber × N
// ═══════════════════════════════════════════════════════════════════════════════

export const MAX_CYCLE_SPINS = 36;

// ─── Progression table ────────────────────────────────────────────────────────
export const ECHO_PROGRESSION = [
  { level: 1, chipsPerNumber: 1, minLoss: 0,   maxLoss: 24  },
  { level: 2, chipsPerNumber: 2, minLoss: 25,  maxLoss: 59  },
  { level: 3, chipsPerNumber: 3, minLoss: 60,  maxLoss: 119 },
  { level: 4, chipsPerNumber: 4, minLoss: 120, maxLoss: Infinity },
];

/**
 * Returns the progression level (1–4) based on accumulated cycle loss.
 * @param {number} cycleLoss — negative number (e.g. -30)
 */
export function getEchoProgressionLevel(cycleLoss) {
  const loss = Math.abs(Math.min(0, cycleLoss));
  if (loss <= 24)  return 1;
  if (loss <= 59)  return 2;
  if (loss <= 119) return 3;
  return 4;
}

export function getEchoChipsPerNumber(cycleLoss) {
  return getEchoProgressionLevel(cycleLoss);
}

// ─── Core engine ─────────────────────────────────────────────────────────────

/**
 * Deterministically replay spin history and compute the ECHO strategy state.
 *
 * Call with all spins UP TO (but NOT including) the next spin to bet on.
 * The returned state describes what to do on the NEXT spin.
 *
 * @param {Array<{number:number}|number>} spins
 * @returns {EchoState}
 */
export function computeEchoState(spins) {
  if (!spins || spins.length === 0) return _emptyState();

  // ── Mutable cycle state ───────────────────────────────────────────────────
  let seenNumbers   = new Set();   // all numbers seen in current cycle
  let activeNumbers = [];          // repeaters currently being bet on
  let cycleSpins    = 0;           // spins elapsed in current cycle
  let cycleLoss     = 0;           // accumulated P&L for current cycle (≤ 0)

  // ── Mutable session state ─────────────────────────────────────────────────
  let sessionProfit  = 0;
  let cyclesWon      = 0;
  let cyclesAborted  = 0;
  let peak           = 0;
  let maxDrawdown    = 0;

  const debugLog      = [];
  const allBetResults = [];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function resetCycle() {
    seenNumbers   = new Set();
    activeNumbers = [];
    cycleSpins    = 0;
    cycleLoss     = 0;
  }

  function updateDrawdown() {
    if (sessionProfit > peak) peak = sessionProfit;
    const dd = peak - sessionProfit;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // ── Replay ────────────────────────────────────────────────────────────────
  for (const raw of spins) {
    const num = typeof raw === 'object' ? (raw.number ?? 0) : +raw;
    cycleSpins++;

    // ── Step 1: Resolve bets against CURRENT active numbers ───────────────
    if (activeNumbers.length > 0) {
      const level          = getEchoProgressionLevel(cycleLoss);
      const chipsPerNumber = level;
      const n              = activeNumbers.length;
      const totalBet       = chipsPerNumber * n;
      const isWin          = activeNumbers.includes(num);

      let profit;
      if (isWin) {
        profit = chipsPerNumber * (36 - n);
        debugLog.push(`[ECHO] Cycle WON — hit ${num} at cycle spin ${cycleSpins}. Profit: +${profit}. Active: [${activeNumbers.join(',')}]`);
      } else {
        profit = -totalBet;
      }

      sessionProfit += profit;
      cycleLoss     += profit;
      updateDrawdown();

      allBetResults.push({
        num, isWin, profit,
        chips: totalBet, chipsPerNumber,
        progressionLevel: level,
        activeCount: n,
        cycleSpins,
        activeNumbers: [...activeNumbers],
      });

      if (isWin) {
        cyclesWon++;
        resetCycle();
        // Winning spin does NOT feed into the new cycle's seenNumbers
        continue;
      }
    }

    // ── Step 2: Activation check ──────────────────────────────────────────
    // If num already seen this cycle and not yet active → activate it
    if (seenNumbers.has(num) && !activeNumbers.includes(num)) {
      activeNumbers.push(num);
      debugLog.push(`[ECHO] Number repeated: ${num} → Active: [${activeNumbers.join(',')}] Level:${getEchoProgressionLevel(cycleLoss)}`);
    }
    seenNumbers.add(num);

    // ── Step 3: Abort check ───────────────────────────────────────────────
    if (cycleSpins >= MAX_CYCLE_SPINS) {
      debugLog.push(`[ECHO] Cycle ABORTED — ${MAX_CYCLE_SPINS} spins reached. CycleLoss: ${cycleLoss}`);
      cyclesAborted++;
      resetCycle();
    }
  }

  // ── Current-state derived values ──────────────────────────────────────────
  const progressionLevel  = getEchoProgressionLevel(cycleLoss);
  const chipsPerNumber    = progressionLevel;
  const n                 = activeNumbers.length;
  const totalBet          = chipsPerNumber * n;
  const isActive          = n > 0;
  const spinsRemaining    = MAX_CYCLE_SPINS - cycleSpins;
  const winPreview        = isActive ? chipsPerNumber * (36 - n) : null;
  const status            = cycleSpins === 0 ? 'IDLE'
                          : isActive         ? 'ACTIVE'
                          :                    'TRACKING';

  // ── Session aggregate metrics ─────────────────────────────────────────────
  const totalBetSpins = allBetResults.length;
  const wins          = allBetResults.filter(r => r.isWin).length;
  const losses        = totalBetSpins - wins;
  const winrate       = totalBetSpins > 0
    ? Math.round(wins / totalBetSpins * 100)
    : null;

  const grossWin  = allBetResults.filter(r => r.profit > 0).reduce((s, r) => s + r.profit, 0);
  const grossLoss = Math.abs(allBetResults.filter(r => r.profit < 0).reduce((s, r) => s + r.profit, 0));
  const profitFactor = grossLoss > 0
    ? parseFloat((grossWin / grossLoss).toFixed(2))
    : grossWin > 0 ? 99 : 0;

  // Average active-number count per bet spin
  const avgActiveNumbers = totalBetSpins > 0
    ? parseFloat((allBetResults.reduce((s, r) => s + r.activeCount, 0) / totalBetSpins).toFixed(1))
    : null;

  return {
    // ── Current cycle ──────────────────────────────────────────────────────
    status,
    isActive,
    activeNumbers,
    seenNumbers:      [...seenNumbers],
    cycleSpins,
    spinsRemaining,
    cycleLoss,
    progressionLevel,
    chipsPerNumber,
    totalBet,
    winPreview,

    // betNumbers alias for compatibility with other systems
    betNumbers: [...activeNumbers],

    // ── Session totals ─────────────────────────────────────────────────────
    sessionProfit,
    maxDrawdown,
    cyclesWon,
    cyclesAborted,
    totalCycles:    cyclesWon + cyclesAborted,

    // ── Per-bet aggregate stats ────────────────────────────────────────────
    totalBetSpins,
    wins,
    losses,
    winrate,
    grossWin,
    grossLoss,
    profitFactor,
    avgActiveNumbers,

    debugLog,
    allBetResults,
  };
}

/**
 * Given the ECHO state BEFORE a spin and the spin number, return the bet result.
 * Returns null if no active numbers (nothing to bet on).
 *
 * @param {EchoState} state
 * @param {number}    spinNumber
 * @returns {EchoBetResult | null}
 */
export function calculateEchoBetResult(state, spinNumber) {
  if (!state || !state.isActive) return null;

  const { activeNumbers, chipsPerNumber, progressionLevel, cycleLoss } = state;
  const n      = activeNumbers.length;
  const total  = chipsPerNumber * n;
  const isWin  = activeNumbers.includes(spinNumber);

  return {
    result:          isWin ? 'win' : 'loss',
    profit:          isWin ? chipsPerNumber * (36 - n) : -total,
    payout:          isWin ? chipsPerNumber * 36 : 0,
    chips:           total,
    chipsPerNumber,
    betCount:        n,
    systemType:      'ECHO',
    betSectors:      null,
    betNumbers:      activeNumbers,
    activeNumbers,
    progressionLevel,
    cycleLoss,
    multiplier:      chipsPerNumber,
  };
}

// ─── Scoring helper (used by autoSystem) ─────────────────────────────────────

/**
 * Score the ECHO system based on recent spin history.
 * Higher score = more repeat activity = better conditions for ECHO.
 *
 * @param {Array} spins
 * @param {EchoState|null} echoState   pre-computed state (optional, saves re-computation)
 * @returns {{ score: number, reason: string, repeatDensity: number }}
 */
export function scoreEchoSystem(spins, echoState = null) {
  const nonZero = spins.filter(s => (typeof s === 'object' ? s.number : +s) !== 0);
  const recent  = nonZero.slice(-30);

  if (recent.length < 8) {
    return { score: 0, reason: 'ECHO: datos insuficientes', repeatDensity: 0, uniqueCount: 0 };
  }

  // Count repeats within the window
  const seen = new Set();
  let repeats = 0;
  for (const s of recent) {
    const n = typeof s === 'object' ? s.number : +s;
    if (seen.has(n)) repeats++;
    seen.add(n);
  }

  const repeatDensity = repeats / recent.length;  // 0 → 1
  const uniqueCount   = seen.size;
  const uniqueRatio   = uniqueCount / recent.length;

  let score = 0;

  // Repeat density scoring
  if      (repeatDensity >= 0.50) score += 55;
  else if (repeatDensity >= 0.40) score += 42;
  else if (repeatDensity >= 0.30) score += 28;
  else if (repeatDensity >= 0.20) score += 15;
  else if (repeatDensity <  0.12) score -= 20;

  // Clustering bonus: fewer uniques = numbers repeating more
  if      (uniqueRatio < 0.55) score += 15;
  else if (uniqueRatio > 0.90) score -= 15;

  // Active numbers bonus — ECHO is in the middle of a productive cycle
  if (echoState?.isActive) {
    const n = echoState.activeNumbers.length;
    if      (n >= 5) score += 20;
    else if (n >= 3) score += 14;
    else if (n >= 1) score += 7;
  }

  // Cycle position penalty: close to expiry is risky
  if (echoState?.cycleSpins >= 28) score -= 18;
  else if (echoState?.cycleSpins >= 22) score -= 8;

  // Accumulated loss penalty
  if ((echoState?.cycleLoss ?? 0) <= -80) score -= 20;

  const reason = `ECHO: ${Math.round(repeatDensity * 100)}% rep (${repeats}/${recent.length}), ${uniqueCount} únicos`;
  return {
    score:         Math.max(0, score),
    reason,
    repeatDensity,
    uniqueCount,
    repeats,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _emptyState() {
  return {
    status:           'IDLE',
    isActive:         false,
    activeNumbers:    [],
    seenNumbers:      [],
    cycleSpins:       0,
    spinsRemaining:   MAX_CYCLE_SPINS,
    cycleLoss:        0,
    progressionLevel: 1,
    chipsPerNumber:   1,
    totalBet:         0,
    winPreview:       null,
    betNumbers:       [],
    sessionProfit:    0,
    maxDrawdown:      0,
    cyclesWon:        0,
    cyclesAborted:    0,
    totalCycles:      0,
    totalBetSpins:    0,
    wins:             0,
    losses:           0,
    winrate:          null,
    grossWin:         0,
    grossLoss:        0,
    profitFactor:     0,
    avgActiveNumbers: null,
    debugLog:         [],
    allBetResults:    [],
  };
}
