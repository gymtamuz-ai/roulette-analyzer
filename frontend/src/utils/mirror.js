// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA ESPEJO PRO — ventana 10, activación por racha, ciclo dinámico
//
// Lógica:
//   1. Requiere >= 10 tiradas previas
//   2. NO apuesta siempre — solo activa cuando lossStreak >= 3
//   3. Progresión 10 pasos (extendida) cuando hay racha confirmada
//   4. Bloquea 10 tiradas si se agota el ciclo máximo
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Constantes ───────────────────────────────────────────────────────────────
export const MIRROR_WINDOW        = 10;   // tiradas mínimas para activar
export const MIN_LOSS_STREAK      = 3;    // racha mínima para activar
export const NOISE_THRESHOLD      = 0.70; // tasa de alternancia → patrón ruidoso
export const BLOCK_SPINS          = 10;   // tiradas bloqueadas tras ciclo agotado
export const EXTENDED_MAX_STEPS   = 10;   // pasos cuando hay racha confirmada
export const DEFAULT_MAX_STEPS    = 6;    // pasos sin racha (estado de espera)

// ─── Progresión completa (martingala, 10 pasos) ───────────────────────────────
// Chance simple paga 1:1. Cada paso dobla → recupera todo + 1 chip de ganancia.
export const MIRROR_PROGRESSION = [
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

// ─── Inversores por categoría ─────────────────────────────────────────────────
export function mirrorColor(v)  { return v === 'red'  ? 'black' : v === 'black' ? 'red'  : null; }
export function mirrorParity(v) { return v === 'even' ? 'odd'   : v === 'odd'   ? 'even' : null; }
export function mirrorRange(v)  { return v === 'low'  ? 'high'  : v === 'high'  ? 'low'  : null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function spinHalf(spin) {
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

// ─── Secuencia visual de las últimas N tiradas ───────────────────────────────
export function getSequence(spins, mode) {
  return spins.slice(-MIRROR_WINDOW).map(s => valueForMode(s, mode));
}

// ─── Racha de pérdidas consecutivas del espejo ────────────────────────────────
// = cuántas veces seguidas cayó el MISMO valor al final del historial.
// Si las últimas 4 tiradas son R R R R:
//   - después de R1 apostamos N → R2 cae → PÉRDIDA 1
//   - después de R2 apostamos N → R3 cae → PÉRDIDA 2
//   - después de R3 apostamos N → R4 cae → PÉRDIDA 3
//   - lossStreak = streak(4) - 1 = 3
export function computeLossStreak(spins, mode) {
  let streakValue = null;
  let streak      = 0;
  for (let i = spins.length - 1; i >= 0; i--) {
    const v = valueForMode(spins[i], mode);
    if (v === null) continue;                       // ignorar ceros/nulos
    if (streakValue === null)  { streakValue = v; streak = 1; }
    else if (v === streakValue) { streak++; }
    else                        { break; }
  }
  return Math.max(0, streak - 1);
}

// ─── Detección de patrón ruidoso (muy alternado) ─────────────────────────────
function computeIsNoisy(spins, mode) {
  const vals = spins.slice(-MIRROR_WINDOW)
    .map(s => valueForMode(s, mode))
    .filter(v => v !== null);
  if (vals.length < 4) return false;
  let alt = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1]) alt++;
  return (alt / (vals.length - 1)) > NOISE_THRESHOLD;
}

// ─── Función de activación inteligente ───────────────────────────────────────
export function shouldActivateMirror(spins, mode) {
  if (spins.length < MIRROR_WINDOW) {
    return {
      shouldActivate: false,
      reason: `Esperando ${MIRROR_WINDOW - spins.length} tiradas más`,
      lossStreak: 0,
    };
  }

  const lossStreak = computeLossStreak(spins, mode);
  const isNoisy    = computeIsNoisy(spins, mode);

  if (isNoisy) {
    return {
      shouldActivate: false,
      reason: `Patrón alternado — sin racha clara (${lossStreak}/${MIN_LOSS_STREAK})`,
      lossStreak,
    };
  }

  if (lossStreak < MIN_LOSS_STREAK) {
    return {
      shouldActivate: false,
      reason: `Esperando racha: ${lossStreak}/${MIN_LOSS_STREAK} repeticiones`,
      lossStreak,
    };
  }

  return {
    shouldActivate: true,
    reason: `Racha detectada: ${lossStreak} repetición${lossStreak !== 1 ? 'es' : ''}`,
    lossStreak,
    maxSteps: EXTENDED_MAX_STEPS,
  };
}

// ─── Motor de estado (replay determinístico) ──────────────────────────────────
export function computeMirrorState(spins, mirrorMode = 'color') {
  if (!spins) spins = [];

  // Sin suficiente historia
  if (spins.length < MIRROR_WINDOW) {
    return {
      isActive: false, status: 'WAITING',
      reason: `Esperando ${MIRROR_WINDOW - spins.length} tirada${MIRROR_WINDOW - spins.length !== 1 ? 's' : ''} más`,
      selectedMode: mirrorMode,
      lossStreak: computeLossStreak(spins, mirrorMode),
      sequence: getSequence(spins, mirrorMode),
      cyclesCompleted: 0, cyclesAborted: 0,
    };
  }

  let stepIdx             = 0;
  let cycleActive         = false;
  let cycleMaxSteps       = DEFAULT_MAX_STEPS;
  let blockedUntil        = -1;
  let cyclesCompleted     = 0;
  let cyclesAborted       = 0;
  let currentCycleHistory = [];

  // ── Replay ──
  for (let i = MIRROR_WINDOW; i < spins.length; i++) {
    // Bloqueado → saltar
    if (i <= blockedUntil) continue;

    const prevSpins = spins.slice(0, i);

    // Si no estamos en ciclo, comprobar activación
    if (!cycleActive) {
      const act = shouldActivateMirror(prevSpins, mirrorMode);
      if (!act.shouldActivate) continue;
      cycleActive   = true;
      cycleMaxSteps = act.maxSteps ?? DEFAULT_MAX_STEPS;
    }

    // ─ En ciclo: evaluar apuesta ─
    const step = MIRROR_PROGRESSION[stepIdx];
    if (!step) continue;

    const bet = getCurrentBet(prevSpins, mirrorMode);
    if (!bet) continue;

    const isWin  = evalSpin(spins[i], bet, mirrorMode);
    const profit = isWin ? step.chips : -step.chips;

    currentCycleHistory.push({
      step: step.step, chips: step.chips,
      bet, isWin, result: isWin ? 'win' : 'loss',
      number: spins[i].number, profit,
    });

    if (isWin) {
      cyclesCompleted++;
      cycleActive         = false;
      stepIdx             = 0;
      currentCycleHistory = [];
    } else if (stepIdx >= cycleMaxSteps - 1) {
      // Ciclo agotado → bloquear
      cyclesAborted++;
      cycleActive         = false;
      stepIdx             = 0;
      currentCycleHistory = [];
      blockedUntil        = i + BLOCK_SPINS;
    } else {
      stepIdx++;
    }
  }

  // ── Determinar estado actual ──
  const lastIdx    = spins.length - 1;
  const sequence   = getSequence(spins, mirrorMode);
  const inverted   = sequence.map(v => mirrorValue(v, mirrorMode));
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
      sequence, invertedSequence: inverted,
    };
  }

  // ACTIVO — dentro de un ciclo iniciado en el replay
  if (cycleActive) {
    const cur  = MIRROR_PROGRESSION[stepIdx];
    const next = MIRROR_PROGRESSION[stepIdx + 1];
    const act  = shouldActivateMirror(spins, mirrorMode);
    return {
      isActive: true, status: 'ACTIVE',
      reason: act.reason,
      selectedMode: mirrorMode,
      currentBet, lossStreak: act.lossStreak,
      currentStep: cur.step, totalSteps: cycleMaxSteps,
      chips: cur.chips,
      isLastStep: stepIdx >= cycleMaxSteps - 1,
      cyclesCompleted, cyclesAborted,
      currentCycleHistory: currentCycleHistory.slice(-10),
      sequence, invertedSequence: inverted,
      onWin:  'Reiniciar → paso 1',
      onLoss: stepIdx >= cycleMaxSteps - 1
        ? 'STOP — bloqueo 10 tiradas'
        : `Paso ${cur.step + 1} · ${next?.chips}f`,
    };
  }

  // ── Evaluar activación actual ──
  const activation = shouldActivateMirror(spins, mirrorMode);

  // ACTIVO — condición cumplida, primera apuesta del nuevo ciclo
  if (activation.shouldActivate) {
    const cur  = MIRROR_PROGRESSION[0];
    const next = MIRROR_PROGRESSION[1];
    return {
      isActive: true, status: 'ACTIVE',
      reason: activation.reason,
      selectedMode: mirrorMode,
      currentBet, lossStreak: activation.lossStreak,
      currentStep: cur.step, totalSteps: activation.maxSteps,
      chips: cur.chips,
      isLastStep: false,
      cyclesCompleted, cyclesAborted,
      currentCycleHistory: [],
      sequence, invertedSequence: inverted,
      onWin:  'Reiniciar → paso 1',
      onLoss: `Paso 2 · ${next?.chips}f`,
    };
  }

  // ESPERANDO
  return {
    isActive: false, status: 'WAITING',
    reason: activation.reason,
    selectedMode: mirrorMode,
    lossStreak: activation.lossStreak,
    currentStep: MIRROR_PROGRESSION[0].step,
    chips:       MIRROR_PROGRESSION[0].chips,
    cyclesCompleted, cyclesAborted,
    sequence, invertedSequence: inverted,
  };
}

// ─── Resultado de apuesta ─────────────────────────────────────────────────────
export function calculateMirrorBetResult(mirrorState, spin) {
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
