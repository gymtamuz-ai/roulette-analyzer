// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA VECINOS — Backend (CommonJS)
// ═══════════════════════════════════════════════════════════════════════════════

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];
const N = WHEEL_ORDER.length;

const WHEEL_INDEX = {};
for (let i = 0; i < N; i++) WHEEL_INDEX[WHEEL_ORDER[i]] = i;

const ZONE_RADIUS     = 4;
const ANALYSIS_WINDOW = 20;
const MIN_ZONE_HITS   = 7;
const COOL_SPINS      = 10;
const MAX_STEPS       = 5;

const VECINOS_PROGRESSION = [
  { step: 1, chipsPerNumber: 1, totalChips: 9  },
  { step: 2, chipsPerNumber: 2, totalChips: 18 },
  { step: 3, chipsPerNumber: 3, totalChips: 27 },
  { step: 4, chipsPerNumber: 4, totalChips: 36 },
  { step: 5, chipsPerNumber: 6, totalChips: 54 },
];

// ─── Detección de zona caliente ───────────────────────────────────────────────
function findHotZone(spins) {
  if (spins.length < ANALYSIS_WINDOW) return null;

  const recent = spins.slice(-ANALYSIS_WINDOW);
  const freq   = new Array(N).fill(0);
  for (const s of recent) {
    const pos = WHEEL_INDEX[s.number];
    if (pos !== undefined) freq[pos]++;
  }

  let bestCenter = 0, bestHits = 0;
  for (let center = 0; center < N; center++) {
    let hits = 0;
    for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
      hits += freq[(center + d + N) % N];
    }
    if (hits > bestHits) { bestHits = hits; bestCenter = center; }
  }

  if (bestHits < MIN_ZONE_HITS) return null;

  const numbers = [];
  for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
    numbers.push(WHEEL_ORDER[(bestCenter + d + N) % N]);
  }

  const p        = (2 * ZONE_RADIUS + 1) / N;
  const expected = ANALYSIS_WINDOW * p;
  const sigma    = Math.sqrt(ANALYSIS_WINDOW * p * (1 - p));
  const zScore   = sigma > 0 ? (bestHits - expected) / sigma : 0;

  return {
    center:   WHEEL_ORDER[bestCenter],
    numbers,
    hits:     bestHits,
    expected: parseFloat(expected.toFixed(2)),
    sigma:    parseFloat(sigma.toFixed(2)),
    zScore:   parseFloat(zScore.toFixed(2)),
  };
}

// ─── Motor de estado ──────────────────────────────────────────────────────────
function computeVecinosState(spins) {
  if (!spins) spins = [];

  let stepIdx        = 0;
  let cycleInvested  = 0;
  let blockedUntil   = -1;
  let inCycle        = false;
  let activeSet      = null;
  let activeNums     = null;
  let activeZoneInfo = null;
  let cyclesCompleted = 0;
  let cyclesAborted   = 0;

  for (let i = 0; i < spins.length; i++) {
    if (i <= blockedUntil) continue;
    if (i < ANALYSIS_WINDOW) continue;

    const prevSpins = spins.slice(0, i);

    if (!inCycle) {
      const zone = findHotZone(prevSpins);
      if (!zone) continue;
      inCycle        = true;
      stepIdx        = 0;
      cycleInvested  = 0;
      activeSet      = new Set(zone.numbers);
      activeNums     = zone.numbers;
      activeZoneInfo = zone;
    }

    const isWin = activeSet.has(spins[i].number);

    if (isWin) {
      cyclesCompleted++;
      inCycle        = false;
      activeSet      = null;
      activeNums     = null;
      activeZoneInfo = null;
      stepIdx        = 0;
      cycleInvested  = 0;
    } else {
      cycleInvested += VECINOS_PROGRESSION[stepIdx].totalChips;
      if (stepIdx >= MAX_STEPS - 1) {
        cyclesAborted++;
        inCycle        = false;
        activeSet      = null;
        activeNums     = null;
        activeZoneInfo = null;
        blockedUntil   = i + COOL_SPINS;
        stepIdx        = 0;
        cycleInvested  = 0;
      } else {
        stepIdx++;
      }
    }
  }

  const lastIdx = spins.length - 1;

  // COOLING
  if (spins.length > 0 && lastIdx <= blockedUntil) {
    return {
      status: 'COOLING', isActive: false,
      spinsRemaining: blockedUntil - lastIdx,
      cyclesCompleted, cyclesAborted,
      numbers: null,
    };
  }

  // WAITING
  if (spins.length < ANALYSIS_WINDOW) {
    return { status: 'WAITING', isActive: false, cyclesCompleted, cyclesAborted, numbers: null };
  }

  // ACTIVE mid-cycle
  if (inCycle && activeSet) {
    const prog = VECINOS_PROGRESSION[stepIdx];
    return {
      status: 'ACTIVE', isActive: true,
      numbers: activeNums,
      step: prog.step,
      chipsPerNumber: prog.chipsPerNumber,
      totalChips: prog.totalChips,
      netProfitIfWin: 27 * prog.chipsPerNumber - cycleInvested,
      cycleInvested,
      isLastStep: stepIdx === MAX_STEPS - 1,
      cyclesCompleted, cyclesAborted,
    };
  }

  // Re-evaluar zona
  const freshZone = findHotZone(spins);

  // STANDBY
  if (!freshZone) {
    return { status: 'STANDBY', isActive: false, cyclesCompleted, cyclesAborted, numbers: null };
  }

  // ACTIVE nuevo ciclo
  const prog0 = VECINOS_PROGRESSION[0];
  return {
    status: 'ACTIVE', isActive: true,
    numbers: freshZone.numbers,
    zone: freshZone,
    step: 1,
    chipsPerNumber: prog0.chipsPerNumber,
    totalChips: prog0.totalChips,
    netProfitIfWin: 27,
    cycleInvested: 0,
    isLastStep: false,
    cyclesCompleted, cyclesAborted,
    confidence: Math.min(99, Math.round(freshZone.zScore * 38)),
  };
}

// ─── Calcular resultado de apuesta ────────────────────────────────────────────
function calculateVecinosBetResult(state, spinNumber) {
  if (!state || !state.isActive) return null;
  const { chipsPerNumber, totalChips, step, numbers } = state;
  if (!numbers) return null;
  const isWin = numbers.includes(spinNumber);
  return {
    result:     isWin ? 'win' : 'loss',
    payout:     isWin ? 36 * chipsPerNumber : 0,
    profit:     isWin ? 27 * chipsPerNumber : -totalChips,
    chips:      totalChips,
    multiplier: step,
    systemType: 'VECINOS',
    betSectors: null,
  };
}

module.exports = {
  findHotZone, computeVecinosState, calculateVecinosBetResult,
  VECINOS_PROGRESSION, ZONE_RADIUS, ANALYSIS_WINDOW, MIN_ZONE_HITS,
};
