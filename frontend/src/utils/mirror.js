// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA ESPEJO — ventana deslizante de 10, referencia = PRIMER número
//
// Lógica:
//   1. Espera 10 tiradas para formar la ventana inicial
//   2. Apuesta SIEMPRE el espejo del PRIMER número de la ventana
//   3. La ventana se desplaza de a 1 con cada nuevo spin
//   4. Bloquea 10 tiradas si se acumulan 3 pérdidas consecutivas
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Constantes ───────────────────────────────────────────────────────────────
export const MIRROR_WINDOW      = 10;  // tamaño de la ventana
export const MIN_LOSS_STREAK    = 3;   // pérdidas consecutivas → bloqueo
export const BLOCK_SPINS        = 10;  // tiradas bloqueadas tras 3 pérdidas
export const EXTENDED_MAX_STEPS = 10;  // pasos disponibles en la progresión
export const DEFAULT_MAX_STEPS  = 3;   // máximo antes de bloqueo
export const NOISE_THRESHOLD    = 0.70; // legacy (no usado en nueva lógica)

// ─── Progresión (martingala, hasta 10 pasos disponibles) ─────────────────────
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

// ─── Inversores ───────────────────────────────────────────────────────────────
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

// ─── Etiquetas para debug ─────────────────────────────────────────────────────
function valueLabel(v, mode) {
  if (!v) return '?';
  if (mode === 'range')  return v === 'low'  ? 'MENOR' : 'MAYOR';
  if (mode === 'color')  return v === 'red'  ? 'ROJO'  : 'NEGRO';
  if (mode === 'parity') return v === 'even' ? 'PAR'   : 'IMPAR';
  return v;
}

// ─── Secuencia visual de la ventana ──────────────────────────────────────────
export function getSequence(spins, mode) {
  return spins.slice(-MIRROR_WINDOW).map(s => valueForMode(s, mode));
}

// ─── NUEVO: apuesta = espejo del PRIMER número de la ventana de 10 ────────────
//   Anterior: leía el ÚLTIMO valor del historial completo (incorrecto).
//   Nuevo:    lee el PRIMERO de spins.slice(-MIRROR_WINDOW) (correcto).
function getCurrentBet(spins, mode) {
  const window = spins.slice(-MIRROR_WINDOW);
  for (let i = 0; i < window.length; i++) {
    const v = valueForMode(window[i], mode);
    if (v !== null) return mirrorValue(v, mode);
  }
  return null;
}

// ─── Info de referencia (primer elemento válido de la ventana) ────────────────
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

// ─── Evaluación de resultado ──────────────────────────────────────────────────
function evalSpin(spin, bet, mode) {
  if (!bet) return false;
  if (mode === 'color')  return spin.color  === bet;
  if (mode === 'parity') return spin.parity === bet;
  if (mode === 'range')  return spinHalf(spin) === bet;
  return false;
}

// ─── Legacy: racha de valores consecutivos iguales (usado en scoring externo) ─
export function computeLossStreak(spins, mode) {
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

// ─── Activación (simplificada: solo necesita ventana completa) ────────────────
export function shouldActivateMirror(spins, mode) {
  if (spins.length < MIRROR_WINDOW) {
    return {
      shouldActivate: false,
      reason: `Esperando ${MIRROR_WINDOW - spins.length} tirada${MIRROR_WINDOW - spins.length !== 1 ? 's' : ''} más`,
      lossStreak: 0,
    };
  }
  return {
    shouldActivate: true,
    reason: 'Ventana de 10 completa — sistema activo',
    lossStreak: 0,
    maxSteps: EXTENDED_MAX_STEPS,
  };
}

// ─── Motor de estado (replay determinístico) ──────────────────────────────────
export function computeMirrorState(spins, mirrorMode = 'color') {
  if (!spins) spins = [];

  // ── Sin ventana completa ──
  if (spins.length < MIRROR_WINDOW) {
    return {
      isActive: false, status: 'WAITING',
      reason: `Esperando completar ventana de ${MIRROR_WINDOW} números (faltan ${MIRROR_WINDOW - spins.length})`,
      selectedMode: mirrorMode,
      lossStreak: 0,
      sequence: getSequence(spins, mirrorMode),
      invertedSequence: [],
      cyclesCompleted: 0, cyclesAborted: 0,
    };
  }

  // ── Replay determinístico ──
  let stepIdx           = 0;   // índice en MIRROR_PROGRESSION
  let consecutiveLosses = 0;   // pérdidas consecutivas de apuesta
  let blockedUntil      = -1;  // índice hasta el que estamos bloqueados
  let cyclesCompleted   = 0;   // veces que ganamos (reseteamos a paso 1)
  let cyclesAborted     = 0;   // veces que llegamos a 3 pérdidas seguidas

  for (let i = MIRROR_WINDOW; i < spins.length; i++) {
    // En período de bloqueo → saltar
    if (i <= blockedUntil) continue;

    const prevSpins = spins.slice(0, i);
    const bet = getCurrentBet(prevSpins, mirrorMode);
    if (!bet) continue;

    const step  = MIRROR_PROGRESSION[Math.min(stepIdx, MIRROR_PROGRESSION.length - 1)];
    const isWin = evalSpin(spins[i], bet, mirrorMode);

    if (isWin) {
      cyclesCompleted++;
      consecutiveLosses = 0;
      stepIdx           = 0;    // ganar → volver a paso 1
    } else {
      consecutiveLosses++;
      if (consecutiveLosses >= MIN_LOSS_STREAK) {
        // 3 pérdidas consecutivas → bloquear
        cyclesAborted++;
        blockedUntil      = i + BLOCK_SPINS;
        consecutiveLosses = 0;
        stepIdx           = 0;  // reiniciar desde paso 1 al salir del bloqueo
      } else {
        stepIdx = Math.min(stepIdx + 1, MIRROR_PROGRESSION.length - 1);
      }
    }
  }

  // ── Estado actual ──
  const lastIdx    = spins.length - 1;
  const sequence   = getSequence(spins, mirrorMode);
  const inverted   = sequence.map(v => mirrorValue(v, mirrorMode));
  const currentBet = getCurrentBet(spins, mirrorMode);
  const ref        = getRefInfo(spins, mirrorMode);
  const cur        = MIRROR_PROGRESSION[Math.min(stepIdx, MIRROR_PROGRESSION.length - 1)];
  const next       = MIRROR_PROGRESSION[Math.min(stepIdx + 1, MIRROR_PROGRESSION.length - 1)];

  // ── BLOQUEADO ──
  if (lastIdx > 0 && lastIdx <= blockedUntil) {
    const spinsRemaining = blockedUntil - lastIdx;
    console.log(
      `[ESPEJO] Window: [${spins.slice(-MIRROR_WINDOW).map(s => s.number).join(', ')}]\n` +
      `  Reference number: ${ref.refNumber ?? '—'}\n` +
      `  Reference type:   ${ref.refLabel  ?? '—'}\n` +
      `  Next bet:         BLOQUEADO\n` +
      `  Loss streak:      ${MIN_LOSS_STREAK}\n` +
      `  Cycle paused:     true (${spinsRemaining} tiradas restantes)`
    );
    return {
      isActive: false, status: 'BLOCKED',
      reason: `3 pérdidas consecutivas — bloqueado (${spinsRemaining} tiradas restantes)`,
      selectedMode: mirrorMode,
      lossStreak: MIN_LOSS_STREAK,
      currentStep: 1, chips: MIRROR_PROGRESSION[0].chips,
      cyclesCompleted, cyclesAborted, spinsRemaining,
      sequence, invertedSequence: inverted,
      ...ref,
    };
  }

  // ── ACTIVO ──
  const isLastStep = consecutiveLosses >= MIN_LOSS_STREAK - 1;

  console.log(
    `[ESPEJO] Window: [${spins.slice(-MIRROR_WINDOW).map(s => s.number).join(', ')}]\n` +
    `  Reference number: ${ref.refNumber ?? '—'}\n` +
    `  Reference type:   ${ref.refLabel  ?? '—'}\n` +
    `  Next bet:         ${ref.betLabel  ?? '—'} (${currentBet ?? '—'})\n` +
    `  Loss streak:      ${consecutiveLosses}\n` +
    `  Cycle paused:     false`
  );

  return {
    isActive: true, status: 'ACTIVE',
    reason: ref.refNumber !== null
      ? `Ref: ${ref.refNumber} → ${ref.refLabel} → apostar ${ref.betLabel}`
      : 'Ventana de 10 activa',
    selectedMode: mirrorMode,
    currentBet,
    lossStreak: consecutiveLosses,
    currentStep:  cur.step,
    totalSteps:   MIN_LOSS_STREAK,   // máximo 3 pérdidas antes del bloqueo
    chips:        cur.chips,
    isLastStep,
    cyclesCompleted, cyclesAborted,
    currentCycleHistory: [],
    sequence, invertedSequence: inverted,
    ...ref,
    onWin:  'Ganar → reiniciar paso 1',
    onLoss: isLastStep
      ? `STOP — bloqueo ${BLOCK_SPINS} tiradas`
      : `Pérdida ${consecutiveLosses + 1}/${MIN_LOSS_STREAK} → paso ${cur.step + 1} · ${next.chips}f`,
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
