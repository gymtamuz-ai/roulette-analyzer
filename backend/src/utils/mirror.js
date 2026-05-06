// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA ESPEJO — Backend (CommonJS)
// ventana deslizante de 10, referencia = PRIMER número
// ═══════════════════════════════════════════════════════════════════════════════

const MIRROR_WINDOW      = 10;
const MIN_WATCH_LOSSES   = 3;   // fallos observados → activa la apuesta
const MIN_LOSS_STREAK    = 3;   // pérdidas apostadas consecutivas → bloqueo
const BLOCK_SPINS        = 10;
const EXTENDED_MAX_STEPS = 10;
const DEFAULT_MAX_STEPS  = 3;

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

function valueLabel(v, mode) {
  if (!v) return '?';
  if (mode === 'range')  return v === 'low'  ? 'MENOR' : 'MAYOR';
  if (mode === 'color')  return v === 'red'  ? 'ROJO'  : 'NEGRO';
  if (mode === 'parity') return v === 'even' ? 'PAR'   : 'IMPAR';
  return v;
}

// ─── NUEVO: apuesta = espejo del PRIMER número de la ventana de 10 ────────────
function getCurrentBet(spins, mode) {
  const window = spins.slice(-MIRROR_WINDOW);
  for (let i = 0; i < window.length; i++) {
    const v = valueForMode(window[i], mode);
    if (v !== null) return mirrorValue(v, mode);
  }
  return null;
}

function getRefInfo(spins, mode) {
  const window = spins.slice(-MIRROR_WINDOW);
  for (let i = 0; i < window.length; i++) {
    const v = valueForMode(window[i], mode);
    if (v !== null) {
      return {
        refNumber: window[i].number,
        refValue:  v,
        refLabel:  valueLabel(v, mode),
        bet:       mirrorValue(v, mode),
        betLabel:  valueLabel(mirrorValue(v, mode), mode),
      };
    }
  }
  return { refNumber: null, refValue: null, refLabel: null, bet: null, betLabel: null };
}

function evalSpin(spin, bet, mode) {
  if (!bet) return false;
  if (mode === 'color')  return spin.color  === bet;
  if (mode === 'parity') return spin.parity === bet;
  if (mode === 'range')  return spinHalf(spin) === bet;
  return false;
}

// ─── Motor de estado ──────────────────────────────────────────────────────────
function computeMirrorState(spins, mirrorMode = 'color') {
  if (!spins) spins = [];

  if (spins.length < MIRROR_WINDOW) {
    return {
      isActive: false, status: 'WAITING',
      reason: `Esperando completar ventana de ${MIRROR_WINDOW} números (faltan ${MIRROR_WINDOW - spins.length})`,
      selectedMode: mirrorMode,
      lossStreak: 0, watchLosses: 0,
      cyclesCompleted: 0, cyclesAborted: 0,
    };
  }

  let stepIdx           = 0;
  let consecutiveLosses = 0;
  let blockedUntil      = -1;
  let cyclesCompleted   = 0;
  let cyclesAborted     = 0;
  let watching          = true;  // fase de observación
  let watchLosses       = 0;     // fallos observados consecutivos

  for (let i = MIRROR_WINDOW; i < spins.length; i++) {
    if (i <= blockedUntil) continue;

    const prevSpins = spins.slice(0, i);
    const bet = getCurrentBet(prevSpins, mirrorMode);
    if (!bet) continue;

    const isWin = evalSpin(spins[i], bet, mirrorMode);

    if (watching) {
      if (!isWin) {
        watchLosses++;
        if (watchLosses >= MIN_WATCH_LOSSES) {
          watching          = false;
          watchLosses       = 0;
          consecutiveLosses = 0;
          stepIdx           = 0;
        }
      } else {
        watchLosses = 0;
      }
    } else {
      if (isWin) {
        cyclesCompleted++;
        consecutiveLosses = 0;
        stepIdx           = 0;
        watching          = true;
        watchLosses       = 0;
      } else {
        consecutiveLosses++;
        if (consecutiveLosses >= MIN_LOSS_STREAK) {
          cyclesAborted++;
          blockedUntil      = i + BLOCK_SPINS;
          watching          = true;
          watchLosses       = 0;
          consecutiveLosses = 0;
          stepIdx           = 0;
        } else {
          stepIdx = Math.min(stepIdx + 1, MIRROR_PROGRESSION.length - 1);
        }
      }
    }
  }

  const lastIdx    = spins.length - 1;
  const currentBet = getCurrentBet(spins, mirrorMode);
  const ref        = getRefInfo(spins, mirrorMode);
  const cur        = MIRROR_PROGRESSION[Math.min(stepIdx, MIRROR_PROGRESSION.length - 1)];
  const next       = MIRROR_PROGRESSION[Math.min(stepIdx + 1, MIRROR_PROGRESSION.length - 1)];

  // BLOQUEADO
  if (lastIdx > 0 && lastIdx <= blockedUntil) {
    const spinsRemaining = blockedUntil - lastIdx;
    console.log(`[ESPEJO] BLOQUEADO · ${spinsRemaining} tiradas restantes`);
    return {
      isActive: false, status: 'BLOCKED',
      reason: `3 pérdidas apostadas — bloqueado (${spinsRemaining} tiradas restantes)`,
      selectedMode: mirrorMode,
      lossStreak: MIN_LOSS_STREAK, watchLosses: 0,
      currentStep: 1, chips: MIRROR_PROGRESSION[0].chips,
      cyclesCompleted, cyclesAborted, spinsRemaining,
      ...ref,
    };
  }

  // OBSERVANDO
  if (watching) {
    console.log(`[ESPEJO] WATCHING · watchLosses=${watchLosses}/${MIN_WATCH_LOSSES} · bet-would-be=${currentBet ?? '—'}`);
    return {
      isActive: false, status: 'WATCHING',
      reason: watchLosses > 0
        ? `Observando · ${watchLosses}/${MIN_WATCH_LOSSES} fallos → activa al ${MIN_WATCH_LOSSES}°`
        : 'Observando — esperando 3 fallos consecutivos para activar',
      selectedMode: mirrorMode,
      currentBet,
      lossStreak: watchLosses, watchLosses,
      currentStep: 1, chips: MIRROR_PROGRESSION[0].chips,
      cyclesCompleted, cyclesAborted,
      ...ref,
    };
  }

  // ACTIVO
  const isLastStep = consecutiveLosses >= MIN_LOSS_STREAK - 1;
  console.log(`[ESPEJO] ACTIVE · paso=${cur.step} · bet=${currentBet ?? '—'} · losses=${consecutiveLosses}`);
  return {
    isActive: true, status: 'ACTIVE',
    reason: ref.refNumber !== null
      ? `Ref: ${ref.refNumber} → ${ref.refLabel} → apostar ${ref.betLabel}`
      : 'Ventana de 10 activa',
    selectedMode: mirrorMode,
    currentBet,
    lossStreak: consecutiveLosses, watchLosses: 0,
    currentStep:  cur.step,
    totalSteps:   MIN_LOSS_STREAK,
    chips:        cur.chips,
    isLastStep,
    cyclesCompleted, cyclesAborted,
    ...ref,
    onWin:  'Ganar → volver a observar',
    onLoss: isLastStep
      ? `STOP — bloqueo ${BLOCK_SPINS} tiradas`
      : `Pérdida ${consecutiveLosses + 1}/${MIN_LOSS_STREAK} → paso ${cur.step + 1} · ${next.chips}f`,
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
