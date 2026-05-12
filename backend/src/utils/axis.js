// ═══════════════════════════════════════════════════════════════════════════════
// AXIS STRATEGY ENGINE — Phase 1 (CommonJS backend port)
// Logic identical to frontend/src/utils/axis.js — keep in sync.
// ═══════════════════════════════════════════════════════════════════════════════

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13,
  36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const N = WHEEL_ORDER.length;

const AXIS_GRID = [
  [32, 15, 19,  4, 21,  2],  // H1
  [25, 17, 34,  6, 27, 13],  // H2
  [36, 11, 30,  8, 23, 10],  // H3
  [ 5, 24, 16, 33,  1, 20],  // H4
  [14, 31,  9, 22, 18, 29],  // H5
  [ 7, 28, 12, 35,  3, 26],  // H6
];

const H_SECTORS = {
  1: [32, 15, 19,  4, 21,  2],
  2: [25, 17, 34,  6, 27, 13],
  3: [36, 11, 30,  8, 23, 10],
  4: [ 5, 24, 16, 33,  1, 20],
  5: [14, 31,  9, 22, 18, 29],
  6: [ 7, 28, 12, 35,  3, 26],
};

const V_SECTORS = {
  1: [32, 25, 36,  5, 14,  7],
  2: [15, 17, 11, 24, 31, 28],
  3: [19, 34, 30, 16,  9, 12],
  4: [ 4,  6,  8, 33, 22, 35],
  5: [21, 27, 23,  1, 18,  3],
  6: [ 2, 13, 10, 20, 29, 26],
};

const NUMBER_TO_H = {};
const NUMBER_TO_V = {};
const WHEEL_IDX   = {};

for (let row = 0; row < 6; row++) {
  for (let col = 0; col < 6; col++) {
    const n = AXIS_GRID[row][col];
    NUMBER_TO_H[n] = row + 1;
    NUMBER_TO_V[n] = col + 1;
  }
}
NUMBER_TO_H[0] = null;
NUMBER_TO_V[0] = null;

for (let i = 0; i < N; i++) WHEEL_IDX[WHEEL_ORDER[i]] = i;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function eclipseNumber(h, v) {
  return AXIS_GRID[h - 1][v - 1];
}

function getEclipseBetNumbers(ace) {
  const idx    = WHEEL_IDX[ace];
  const result = new Set();
  for (let d = -2; d <= 2; d++) {
    const n = WHEEL_ORDER[((idx + d) + N) % N];
    if (n !== 0) result.add(n);
  }
  return Array.from(result);
}

function sectorStatus(lastSeenAgo) {
  if (lastSeenAgo === null) return 'unplayed';
  if (lastSeenAgo > 28)    return 'sleeping';
  if (lastSeenAgo <= 5)    return 'hot';
  return 'normal';
}

function detectTrigger(nonZeroHistory, sectorMap) {
  // Primary: ≥2 hits in last 3
  const l3 = nonZeroHistory.slice(-3);
  const c3  = {};
  for (const n of l3) { const s = sectorMap[n]; if (s) c3[s] = (c3[s] || 0) + 1; }
  let best3 = null, n3 = 0;
  for (const [s, c] of Object.entries(c3)) {
    if (c >= 2 && c > n3) { best3 = +s; n3 = c; }
  }
  if (best3 !== null) return { sector: best3, count: n3, window: 3 };

  // Secondary: ≥3 hits in last 6
  const l6 = nonZeroHistory.slice(-6);
  const c6  = {};
  for (const n of l6) { const s = sectorMap[n]; if (s) c6[s] = (c6[s] || 0) + 1; }
  let best6 = null, n6 = 0;
  for (const [s, c] of Object.entries(c6)) {
    if (c >= 3 && c > n6) { best6 = +s; n6 = c; }
  }
  if (best6 !== null) return { sector: best6, count: n6, window: 6 };

  return null;
}

// ─── Main state machine ───────────────────────────────────────────────────────
function computeAxisState(spins) {
  if (!spins || spins.length === 0) return _emptyState();

  let status         = 'IDLE';
  let spinsRemaining = 0;
  let cooldown       = 0;
  let triggeredH     = null;
  let triggeredV     = null;
  let aceNumber      = null;
  let betNumbers     = [];
  let cyclesWon      = 0;
  let cyclesAborted  = 0;
  const nonZeroHist  = [];
  const hSeen = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  const vSeen = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };

  function tick(h, v) {
    for (let s = 1; s <= 6; s++) {
      if (hSeen[s] !== null) hSeen[s]++;
      if (vSeen[s] !== null) vSeen[s]++;
    }
    if (h) hSeen[h] = 0;
    if (v) vSeen[v] = 0;
  }

  for (let i = 0; i < spins.length; i++) {
    const raw = spins[i];
    const num = typeof raw === 'object' ? (raw.number ?? 0) : +raw;

    if (num === 0) { tick(null, null); continue; }

    const h = NUMBER_TO_H[num];
    const v = NUMBER_TO_V[num];
    tick(h, v);
    nonZeroHist.push(num);

    // COOLDOWN
    if (status === 'COOLDOWN') {
      cooldown--;
      if (cooldown <= 0) status = 'IDLE';
      continue;
    }

    // ACTIVE BET SPIN
    if (spinsRemaining > 0) {
      const isWin = betNumbers.includes(num);
      if (isWin) {
        cyclesWon++;
        spinsRemaining = 0;
        cooldown       = 1;
        status         = 'COOLDOWN';
        betNumbers     = [];
        triggeredH     = null;
        triggeredV     = null;
        aceNumber      = null;
      } else {
        spinsRemaining--;
        if (spinsRemaining === 0) {
          cyclesAborted++;
          status     = 'IDLE';
          betNumbers = [];
          triggeredH = null;
          triggeredV = null;
          aceNumber  = null;
        }
      }
      continue;
    }

    // IDLE — detect trigger
    const trigH = detectTrigger(nonZeroHist, NUMBER_TO_H);
    const trigV = detectTrigger(nonZeroHist, NUMBER_TO_V);

    if (trigH && trigV) {
      const ace  = eclipseNumber(trigH.sector, trigV.sector);
      const bets = getEclipseBetNumbers(ace);
      triggeredH     = trigH.sector;
      triggeredV     = trigV.sector;
      aceNumber      = ace;
      betNumbers     = bets;
      spinsRemaining = 4;
      status         = 'TRIGGERED_ECLIPSE';
    } else if (trigH) {
      triggeredH     = trigH.sector;
      triggeredV     = null;
      aceNumber      = null;
      betNumbers     = [...H_SECTORS[trigH.sector]];
      spinsRemaining = 4;
      status         = 'TRIGGERED_H';
    } else if (trigV) {
      triggeredH     = null;
      triggeredV     = trigV.sector;
      aceNumber      = null;
      betNumbers     = [...V_SECTORS[trigV.sector]];
      spinsRemaining = 4;
      status         = 'TRIGGERED_V';
    }
  }

  const sectorStats = { h: {}, v: {} };
  for (let s = 1; s <= 6; s++) {
    sectorStats.h[s] = { lastSeenAgo: hSeen[s], status: sectorStatus(hSeen[s]) };
    sectorStats.v[s] = { lastSeenAgo: vSeen[s], status: sectorStatus(vSeen[s]) };
  }

  return {
    status,
    isActive:      spinsRemaining > 0,
    triggeredH,
    triggeredV,
    aceNumber,
    betNumbers,
    spinsRemaining,
    spinsUsed:     spinsRemaining > 0 ? 4 - spinsRemaining : 0,
    cyclesWon,
    cyclesAborted,
    sectorStats,
  };
}

function _emptyState() {
  const sectorStats = { h: {}, v: {} };
  for (let s = 1; s <= 6; s++) {
    sectorStats.h[s] = { lastSeenAgo: null, status: 'unplayed' };
    sectorStats.v[s] = { lastSeenAgo: null, status: 'unplayed' };
  }
  return {
    status: 'IDLE', isActive: false,
    triggeredH: null, triggeredV: null, aceNumber: null,
    betNumbers: [], spinsRemaining: 0, spinsUsed: 0, sectorStats,
  };
}

// ─── Bet result ───────────────────────────────────────────────────────────────
/**
 * stakePerNumber = chips per number from the AXIS6Stars progression table.
 * Default 1 = flat betting (backward compatible).
 *
 * European roulette P&L (stake s per number, n numbers covered):
 *   Win:  +s × (36 − n)
 *   Loss: −s × n
 */
function calculateAxisBetResult(state, spinNumber, stakePerNumber = 1) {
  if (!state || !state.isActive) return null;
  const isWin    = state.betNumbers.includes(spinNumber);
  const betCount = state.betNumbers.length;
  const totalBet = stakePerNumber * betCount;
  return {
    result:         isWin ? 'win' : 'loss',
    payout:         isWin ? stakePerNumber * 36 : 0,
    profit:         isWin ? stakePerNumber * (36 - betCount) : -totalBet,
    chips:          totalBet,
    chipsPerNumber: stakePerNumber,
    multiplier:     stakePerNumber,
    systemType:     'AXIS',
    betSectors:     null,
  };
}

module.exports = { computeAxisState, calculateAxisBetResult };
