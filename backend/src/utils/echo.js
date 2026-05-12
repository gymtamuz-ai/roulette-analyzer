// ═══════════════════════════════════════════════════════════════════════════════
// ECHO STRATEGY ENGINE — Backend (CommonJS mirror of frontend/src/utils/echo.js)
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_CYCLE_SPINS = 36;

function getEchoProgressionLevel(cycleLoss) {
  const loss = Math.abs(Math.min(0, cycleLoss));
  if (loss <= 24)  return 1;
  if (loss <= 59)  return 2;
  if (loss <= 119) return 3;
  return 4;
}

function computeEchoState(spins) {
  if (!spins || spins.length === 0) return _emptyState();

  let seenNumbers   = new Set();
  let activeNumbers = [];
  let cycleSpins    = 0;
  let cycleLoss     = 0;
  let sessionProfit = 0;
  let cyclesWon     = 0;
  let cyclesAborted = 0;

  function resetCycle() {
    seenNumbers   = new Set();
    activeNumbers = [];
    cycleSpins    = 0;
    cycleLoss     = 0;
  }

  for (const raw of spins) {
    const num = typeof raw === 'object' ? (raw.number ?? 0) : +raw;
    cycleSpins++;

    if (activeNumbers.length > 0) {
      const level          = getEchoProgressionLevel(cycleLoss);
      const chipsPerNumber = level;
      const n              = activeNumbers.length;
      const totalBet       = chipsPerNumber * n;
      const isWin          = activeNumbers.includes(num);

      const profit = isWin ? chipsPerNumber * (36 - n) : -totalBet;
      sessionProfit += profit;
      cycleLoss     += profit;

      if (isWin) {
        cyclesWon++;
        resetCycle();
        continue;
      }
    }

    if (seenNumbers.has(num) && !activeNumbers.includes(num)) {
      activeNumbers.push(num);
    }
    seenNumbers.add(num);

    if (cycleSpins >= MAX_CYCLE_SPINS) {
      cyclesAborted++;
      resetCycle();
    }
  }

  const progressionLevel = getEchoProgressionLevel(cycleLoss);
  const chipsPerNumber   = progressionLevel;
  const n                = activeNumbers.length;
  const isActive         = n > 0;

  return {
    status:           cycleSpins === 0 ? 'IDLE' : isActive ? 'ACTIVE' : 'TRACKING',
    isActive,
    activeNumbers,
    seenNumbers:      [...seenNumbers],
    cycleSpins,
    spinsRemaining:   MAX_CYCLE_SPINS - cycleSpins,
    cycleLoss,
    progressionLevel,
    chipsPerNumber,
    totalBet:         chipsPerNumber * n,
    betNumbers:       [...activeNumbers],
    sessionProfit,
    cyclesWon,
    cyclesAborted,
  };
}

function calculateEchoBetResult(state, spinNumber) {
  if (!state || !state.isActive) return null;

  const { activeNumbers, chipsPerNumber, progressionLevel, cycleLoss } = state;
  const n     = activeNumbers.length;
  const total = chipsPerNumber * n;
  const isWin = activeNumbers.includes(spinNumber);

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

function _emptyState() {
  return {
    status: 'IDLE', isActive: false,
    activeNumbers: [], seenNumbers: [],
    cycleSpins: 0, spinsRemaining: MAX_CYCLE_SPINS,
    cycleLoss: 0, progressionLevel: 1,
    chipsPerNumber: 1, totalBet: 0, betNumbers: [],
    sessionProfit: 0, cyclesWon: 0, cyclesAborted: 0,
  };
}

module.exports = { computeEchoState, calculateEchoBetResult, getEchoProgressionLevel, MAX_CYCLE_SPINS };
