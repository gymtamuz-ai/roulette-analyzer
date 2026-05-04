// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA ESPEJO PRO — Backend (idéntico al frontend, CommonJS)
// ═══════════════════════════════════════════════════════════════════════════════

const MIRROR_WINDOW       = 10;
const MIN_LOSS_STREAK     = 3;
const NOISE_THRESHOLD     = 0.70;
const BLOCK_SPINS         = 10;
const EXTENDED_MAX_STEPS  = 10;
const DEFAULT_MAX_STEPS   = 6;

const MIRROR_PROGRESSION = [
  { step: 1,  chips: 1   },
  { step: 2,  chips: 2   },
  { step: 3,  chips: 4   },
  { step: 4,  chips: 8   },
  { step: 5,  chips: 16  },
  { step: 6,  chips: 32  },
  { step: 7,  chips: 64  },
  { step: 8,  chips: 128 },
  { step: 9,  chips: 256 },
  { step: 10, chips: 512 },
];

function mirrorColor(v)  { return v === 'red'  ? 'black' : v === 'black' ? 'red'  : null; }
function mirrorParity(v) { return v === 'even' ? 'odd'   : v === 'odd'   ? 'even' : null; }
function mirrorRange(v)  { return v === 'low'  ? 'high'  : v === 'high'  ? 'low'  : null; }

function spinHalf(spin) {
  if (spin.half) return spin.half;
  if (spin.number === 0) return null;
  return spin.number <= 18 ? 'low' : 'high';
}

function valueForMode(spin, mode) {
  if (mode === 'color')  { const c = spin.color;  return (c && c !== 'green') ? c : null; }
  if (mode === 'parity') { const p = spin.parity; return (p && p !== 'zero')  ? p : null; }
  if (mode === 'range')  return spinHalf(spin);
  return null;
}

function mirrorValue(v, mode) {
  if (!v) return null;
  if (mode === 'color')  return mirrorColor(v);
  if (mode === 'parity') return mirrorParity(v);
  if (mode === 'range')  return mirrorRange(v);
  return null;
}

function getCurrentBet(spins, mode) {
  for (let i = spins.length - 1; i >= 0; i--) {
    const v = valueForMode(spins[i], mode);
    if (v !== null) return mirrorValue(v, mode);
  }
  return null;
}

function evalSpin(spin, bet, mode) {
  if (!bet) return false;
  if (mode === 'color')  return spin.color  === bet;
  if (mode === 'parity') return spin.parity === bet;
  if (mode === 'range')  return spinHalf(spin) === bet;
  return false;
}

function computeLossStreak(spins, mode) {
  let streakValue = null, streak = 0;
  for (let i = spins.length - 1; i >= 0; i--) {
    const v = valueForMode(spins[i], mode);
    if (v === null) continue;
    if (streakValue === null)   { streakValue = v; streak = 1; }
    else if (v === streakValue) { streak++; }
    else                        { break; }
  }
  return Math.max(0, streak - 1);
}

function computeIsNoisy(spins, mode) {
  const vals = spins.slice(-MIRROR_WINDOW)
    .map(s => valueForMode(s, mode))
    .filter(v => v !== null);
  if (vals.length < 4) return false;
  let alt = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1]) alt++;
  return (alt / (vals.length - 1)) > NOISE_THRESHOLD;
}

function shouldActivateMirror(spins, mode) {
  if (spins.length < MIRROR_WINDOW) {
    return { shouldActivate: false, reason: 'Datos insuficientes', lossStreak: 0 };
  }
  const lossStreak = computeLossStreak(spins, mode);
  const isNoisy    = computeIsNoisy(spins, mode);
  if (isNoisy) return { shouldActivate: false, reason: 'Patrón alternado', lossStreak };
  if (lossStreak < MIN_LOSS_STREAK) {
    return { shouldActivate: false, reason: `Racha ${lossStreak}/${MIN_LOSS_STREAK}`, lossStreak };
  }
  return {
    shouldActivate: true,
    reason: `Racha: ${lossStreak} repeticiones`,
    lossStreak,
    maxSteps: EXTENDED_MAX_STEPS,
  };
}

// ─── Motor de estado ──────────────────────────────────────────────────────────
function computeMirrorState(spins, mirrorMode = 'color') {
  if (!spins) spins = [];

  if (spins.length < MIRROR_WINDOW) {
    return { isActive: false, status: 'WAITING', selectedMode: mirrorMode };
  }

  let stepIdx         = 0;
  let cycleActive     = false;
  let cycleMaxSteps   = DEFAULT_MAX_STEPS;
  let blockedUntil    = -1;
  let cyclesCompleted = 0;
  let cyclesAborted   = 0;

  for (let i = MIRROR_WINDOW; i < spins.length; i++) {
    if (i <= blockedUntil) continue;

    const prevSpins = spins.slice(0, i);

    if (!cycleActive) {
      const act = shouldActivateMirror(prevSpins, mirrorMode);
      if (!act.shouldActivate) continue;
      cycleActive   = true;
      cycleMaxSteps = act.maxSteps ?? DEFAULT_MAX_STEPS;
    }

    const step = MIRROR_PROGRESSION[stepIdx];
    if (!step) continue;

    const bet   = getCurrentBet(prevSpins, mirrorMode);
    if (!bet) continue;

    const isWin = evalSpin(spins[i], bet, mirrorMode);

    if (isWin) {
      cyclesCompleted++;
      cycleActive = false; stepIdx = 0;
    } else if (stepIdx >= cycleMaxSteps - 1) {
      cyclesAborted++;
      cycleActive = false; stepIdx = 0;
      blockedUntil = i + BLOCK_SPINS;
    } else {
      stepIdx++;
    }
  }

  const lastIdx    = spins.length - 1;
  const currentBet = getCurrentBet(spins, mirrorMode);

  // BLOQUEADO
  if (lastIdx > 0 && lastIdx <= blockedUntil) {
    const spinsRemaining = blockedUntil - lastIdx;
    return {
      isActive: false, status: 'BLOCKED',
      reason: `Bloqueado: ciclo máximo agotado (${spinsRemaining} tiradas restantes)`,
      selectedMode: mirrorMode,
      lossStreak: computeLossStreak(spins, mirrorMode),
      currentStep: MIRROR_PROGRESSION[stepIdx]?.step ?? 1,
      chips:       MIRROR_PROGRESSION[stepIdx]?.chips ?? 1,
      cyclesCompleted, cyclesAborted, spinsRemaining,
    };
  }

  // ACTIVO — en ciclo
  if (cycleActive) {
    const cur = MIRROR_PROGRESSION[stepIdx];
    const act = shouldActivateMirror(spins, mirrorMode);
    return {
      isActive: true, status: 'ACTIVE',
      reason: act.reason,
      selectedMode: mirrorMode,
      currentBet, lossStreak: act.lossStreak,
      currentStep: cur.step,
      chips: cur.chips, totalSteps: cycleMaxSteps,
      isLastStep: stepIdx >= cycleMaxSteps - 1,
      cyclesCompleted, cyclesAborted,
    };
  }

  // Evaluar activación actual
  const activation = shouldActivateMirror(spins, mirrorMode);
  if (activation.shouldActivate) {
    return {
      isActive: true, status: 'ACTIVE',
      reason: activation.reason,
      selectedMode: mirrorMode,
      currentBet, lossStreak: activation.lossStreak,
      currentStep: 1,
      chips: MIRROR_PROGRESSION[0].chips,
      totalSteps: activation.maxSteps,
      isLastStep: false,
      cyclesCompleted, cyclesAborted,
    };
  }

  // ESPERANDO
  return {
    isActive: false, status: 'WAITING',
    reason: activation.reason,
    selectedMode: mirrorMode,
    lossStreak: activation.lossStreak,
    currentStep: 1, chips: 1,
    cyclesCompleted, cyclesAborted,
  };
}

// ─── Resultado de apuesta ─────────────────────────────────────────────────────
function calculateMirrorBetResult(mirrorState, spin) {
  if (!mirrorState || !mirrorState.isActive) return null;
  const { chips, currentBet, selectedMode, currentStep } = mirrorState;
  if (!currentBet) return null;

  const isWin  = evalSpin(spin, currentBet, selectedMode);
  const profit = isWin ? chips : -chips;

  return {
    result:     isWin ? 'win' : 'loss',
    payout:     isWin ? chips * 2 : 0,
    profit, chips,
    multiplier: currentStep,
    systemType: 'MIRROR',
    betSectors: null,
  };
}

module.exports = {
  computeMirrorState, calculateMirrorBetResult,
  MIRROR_PROGRESSION, MIRROR_WINDOW,
};
