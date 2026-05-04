// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA JACOBO PRO
// Activa la progresión solo cuando hay ventaja estadística (atraso / sesgo).
// Protege banca: bloquea automáticamente tras ciclos perdidos consecutivos.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Set de números (invariante) ──────────────────────────────────────────────
export const JACOBO_NUMBERS = [
  0, 3, 7, 12, 15, 18,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
];
const JACOBO_SET = new Set(JACOBO_NUMBERS);

// ─── Progresión de recuperación acumulada ─────────────────────────────────────
//
// Pleno paga 35:1. Con 21 números apostados:
//   Retorno neto si acierta = 35 × chips − 20 × chips = 15 × chips/número
//
// Diseñada para que 15×c_n > suma acumulada de pasos anteriores en CADA paso:
//
// Paso  chips/n  total    net si acierta (cubre todo lo invertido + ganancia)
//   1      1       21     +15  (15×1 − 0   = 15) ✓
//   2      2       42     +9   (15×2 − 21  =  9) ✓
//   3      5      105     +12  (15×5 − 63  = 12) ✓
//   4     12      252     +12  (15×12 − 168= 12) ✓
//   5     29      609     +15  (15×29 − 420= 15) ✓
//   6     70     1470     +21  (15×70 −1029= 21) ✓
export const JACOBO_PRO_PROGRESSION = [
  { step: 1, chipsPerNumber: 1,  totalChips: 21   },
  { step: 2, chipsPerNumber: 2,  totalChips: 42   },
  { step: 3, chipsPerNumber: 5,  totalChips: 105  },
  { step: 4, chipsPerNumber: 12, totalChips: 252  },
  { step: 5, chipsPerNumber: 29, totalChips: 609  },
  { step: 6, chipsPerNumber: 70, totalChips: 1470 },
];

// ─── Parámetros del sistema ───────────────────────────────────────────────────
const PRE_ANALYSIS_WINDOW       = 20;   // mínimo de tiradas para activar
const RISK_WINDOW               = 50;   // ventana para hit-rate de riesgo
const RISK_HIT_RATE_THRESHOLD   = 0.40; // < 40 % en últimas 50 → riesgo alto
const BLOCK_SPINS               = 10;   // tiradas de pausa tras bloqueo
const CYCLES_TO_BLOCK           = 2;    // ciclos perdidos consecutivos → bloquear
const COND_A_TOP12_MIN          = 5;    // ≥ 5 del set en TOP-12 atrasados
const COND_B_RECENT_MAX         = 6;    // ≤ 6 hits en últimas 20 → activar
const COND_DEACTIVATE_RECENT    = 10;   // ≥ 10 hits en últimas 20 → desactivar

// ─── Helpers de delay ─────────────────────────────────────────────────────────
function computeDelays(spins) {
  // delay[n] = cuántas tiradas han pasado desde la última aparición de n
  // (0 = salió en la última tirada; spins.length = nunca apareció)
  const delays = new Map();
  for (let n = 0; n <= 36; n++) {
    let delay = spins.length; // default: nunca apareció
    for (let i = spins.length - 1; i >= 0; i--) {
      if (spins[i].number === n) { delay = spins.length - 1 - i; break; }
    }
    delays.set(n, delay);
  }
  return delays;
}

// ─── Pre-análisis de oportunidad ──────────────────────────────────────────────
export function evaluateJacoboOpportunity(spins) {
  if (spins.length < PRE_ANALYSIS_WINDOW) {
    return {
      shouldActivate: false,
      reason: `Faltan ${PRE_ANALYSIS_WINDOW - spins.length} tiradas para análisis`,
      confidence: 0,
    };
  }

  const recent20   = spins.slice(-PRE_ANALYSIS_WINDOW);
  const recentHits = recent20.filter(s => JACOBO_SET.has(s.number)).length;

  // ── Desactivar por alta frecuencia reciente ──
  if (recentHits >= COND_DEACTIVATE_RECENT) {
    return {
      shouldActivate: false,
      reason: `Sin ventaja: alta frecuencia reciente (${recentHits}/20)`,
      confidence: 0,
      recentHits,
    };
  }

  const delays      = computeDelays(spins);
  const setDelays   = JACOBO_NUMBERS.map(n => delays.get(n));
  const avgSetDelay = setDelays.reduce((a, b) => a + b, 0) / setDelays.length;

  const allDelays      = Array.from({ length: 37 }, (_, n) => delays.get(n));
  const avgGlobalDelay = allDelays.reduce((a, b) => a + b, 0) / allDelays.length;

  // TOP-12 más atrasados de los 37
  const sorted      = Array.from({ length: 37 }, (_, n) => ({ n, d: delays.get(n) }))
                          .sort((a, b) => b.d - a.d);
  const top12Set    = new Set(sorted.slice(0, 12).map(x => x.n));
  const inTop12     = JACOBO_NUMBERS.filter(n => top12Set.has(n)).length;

  // ── Condiciones de activación (OR) ──
  const condA = inTop12 >= COND_A_TOP12_MIN;                // ≥ 5 del set en TOP-12
  const condB = recentHits <= COND_B_RECENT_MAX;            // ≤ 6 hits/20 recientes
  const condC = avgSetDelay > avgGlobalDelay;               // set más atrasado que promedio

  const shouldActivate = condA || condB || condC;

  // ── Confianza ponderada ──
  let confidence = 0;
  if (condA) confidence += 40;
  if (condB) confidence += 35;
  if (condC) confidence += 25;
  confidence = Math.min(100, confidence);

  // ── Motivo principal ──
  let reason = 'Sin ventaja estadística clara';
  if (!shouldActivate) {
    reason = `Distribución uniforme (${recentHits}/20 · atraso ${avgSetDelay.toFixed(1)})`;
  } else if (condA && condB) {
    reason = `${inTop12} en TOP-12 atrasados + solo ${recentHits}/20 recientes`;
  } else if (condA) {
    reason = `${inTop12} números del set en TOP-12 atrasados`;
  } else if (condB) {
    reason = `Atraso detectado: solo ${recentHits} hits en últimas 20`;
  } else if (condC) {
    reason = `Atraso promedio set ${avgSetDelay.toFixed(1)} > global ${avgGlobalDelay.toFixed(1)}`;
  }

  return {
    shouldActivate, reason, confidence,
    condA, condB, condC,
    recentHits, inTop12,
    avgSetDelay:    parseFloat(avgSetDelay.toFixed(1)),
    avgGlobalDelay: parseFloat(avgGlobalDelay.toFixed(1)),
  };
}

// ─── Evaluación de riesgo ─────────────────────────────────────────────────────
export function evaluateRisk(spins) {
  const window = Math.min(spins.length, RISK_WINDOW);
  if (window < 20) return { isHighRisk: false, reason: '', hitRate: null };

  const recent  = spins.slice(-window);
  const hits    = recent.filter(s => JACOBO_SET.has(s.number)).length;
  const hitRate = hits / window;
  const isHighRisk = hitRate < RISK_HIT_RATE_THRESHOLD;

  return {
    isHighRisk,
    reason: isHighRisk
      ? `Hit rate ${(hitRate * 100).toFixed(0)}% en últ.${window} (umbral ${(RISK_HIT_RATE_THRESHOLD * 100).toFixed(0)}%)`
      : '',
    hitRate: parseFloat(hitRate.toFixed(3)),
    hits, window,
  };
}

// ─── Motor de estado principal (replay determinístico) ────────────────────────
export function computeJacoboState(spins) {
  if (!spins) spins = [];

  let stepIdx               = 0;
  let consecutiveLostCycles = 0;
  let blockedUntil          = -1;   // índice de spin hasta el que está bloqueado
  let cyclesCompleted       = 0;
  let cyclesAborted         = 0;
  let currentCycleInvested  = 0;
  let currentCycleHistory   = [];

  // ── Replay ──
  for (let i = 0; i < spins.length; i++) {
    // Está bloqueado → saltar sin apostar
    if (i <= blockedUntil) continue;

    // Sin historia suficiente para el pre-análisis
    if (i < PRE_ANALYSIS_WINDOW) continue;

    // Evaluamos con las tiradas ANTERIORES a la actual
    const prev = spins.slice(0, i);
    const opp  = evaluateJacoboOpportunity(prev);
    const risk = evaluateRisk(prev);

    // Sistema inactivo → no apostar, no avanzar paso
    if (!opp.shouldActivate || risk.isHighRisk) continue;

    // ─ Sistema ACTIVO para esta tirada ─
    const step  = JACOBO_PRO_PROGRESSION[stepIdx];
    const isWin = JACOBO_SET.has(spins[i].number);

    currentCycleInvested += step.totalChips;
    currentCycleHistory.push({ step: step.step, result: isWin ? 'win' : 'loss', number: spins[i].number });

    if (isWin) {
      cyclesCompleted++;
      consecutiveLostCycles = 0;
      stepIdx              = 0;
      currentCycleInvested = 0;
      currentCycleHistory  = [];
    } else if (stepIdx >= JACOBO_PRO_PROGRESSION.length - 1) {
      // Ciclo abortado en paso 6
      cyclesAborted++;
      consecutiveLostCycles++;
      stepIdx              = 0;
      currentCycleInvested = 0;
      currentCycleHistory  = [];

      if (consecutiveLostCycles >= CYCLES_TO_BLOCK) {
        blockedUntil          = i + BLOCK_SPINS;
        consecutiveLostCycles = 0;
      }
    } else {
      stepIdx++;
    }
  }

  // ── Determinar estado en el momento actual ──
  const lastIdx    = spins.length - 1;
  const curProgRow = JACOBO_PRO_PROGRESSION[stepIdx];

  // ─ BLOQUEADO por ciclos perdidos ─
  if (spins.length > 0 && lastIdx <= blockedUntil) {
    const spinsRemaining = blockedUntil - lastIdx;
    return {
      status: 'BLOCKED', isActive: false, isBlocked: true,
      reason: `Bloqueado: 2 ciclos perdidos seguidos (${spinsRemaining} tiradas restantes)`,
      confidence: 0,
      currentStep: curProgRow.step,
      chipsPerNumber: curProgRow.chipsPerNumber,
      totalChips: curProgRow.totalChips,
      cyclesCompleted, cyclesAborted,
      currentCycleInvested, currentCycleHistory,
      spinsRemaining,
    };
  }

  // ─ Sin datos suficientes ─
  if (spins.length < PRE_ANALYSIS_WINDOW) {
    return {
      status: 'INACTIVE', isActive: false, isBlocked: false,
      reason: `Faltan ${PRE_ANALYSIS_WINDOW - spins.length} tiradas para análisis`,
      confidence: 0,
      cyclesCompleted, cyclesAborted,
    };
  }

  // ─ Evaluar estado actual ─
  const opportunity = evaluateJacoboOpportunity(spins);
  const risk        = evaluateRisk(spins);

  // ─ BLOQUEADO por riesgo estadístico ─
  if (risk.isHighRisk) {
    return {
      status: 'BLOCKED', isActive: false, isBlocked: true,
      reason: `Riesgo alto: ${risk.reason}`,
      confidence: 0,
      currentStep: curProgRow.step,
      chipsPerNumber: curProgRow.chipsPerNumber,
      totalChips: curProgRow.totalChips,
      cyclesCompleted, cyclesAborted,
      currentCycleInvested, currentCycleHistory,
      risk,
    };
  }

  // ─ INACTIVO: sin ventaja ─
  if (!opportunity.shouldActivate) {
    return {
      status: 'INACTIVE', isActive: false, isBlocked: false,
      reason: opportunity.reason,
      confidence: opportunity.confidence,
      currentStep: curProgRow.step,
      chipsPerNumber: curProgRow.chipsPerNumber,
      totalChips: curProgRow.totalChips,
      cyclesCompleted, cyclesAborted,
      currentCycleInvested, currentCycleHistory,
      opportunity, risk,
    };
  }

  // ─ ACTIVO ─
  const isLastStep    = stepIdx === JACOBO_PRO_PROGRESSION.length - 1;
  const netProfitIfWin = 15 * curProgRow.chipsPerNumber - currentCycleInvested;
  const nextRow        = JACOBO_PRO_PROGRESSION[stepIdx + 1];
  const onWin  = `+${netProfitIfWin}f neto → reiniciar paso 1`;
  const onLoss = isLastStep
    ? 'STOP — ciclo abortado, reiniciar'
    : `Avanzar paso ${curProgRow.step + 1} (${nextRow.chipsPerNumber}f/núm · ${nextRow.totalChips}f total)`;

  return {
    status: 'ACTIVE', isActive: true, isBlocked: false,
    reason: opportunity.reason,
    confidence: opportunity.confidence,
    currentStep: curProgRow.step,
    totalSteps: JACOBO_PRO_PROGRESSION.length,
    chipsPerNumber: curProgRow.chipsPerNumber,
    totalChips: curProgRow.totalChips,
    netProfitIfWin,
    onWin, onLoss, isLastStep,
    cyclesCompleted, cyclesAborted,
    currentCycleInvested,
    currentCycleHistory: currentCycleHistory.slice(-6),
    opportunity, risk,
  };
}

// ─── Calcular resultado de apuesta (para uso externo) ─────────────────────────
// Retorna null si el sistema no está activo → no se registra apuesta.
export function calculateJacoboBetResult(state, spinNumber) {
  if (!state || !state.isActive) return null;
  const { chipsPerNumber, totalChips, confidence, reason, currentStep } = state;
  const isWin = JACOBO_SET.has(spinNumber);
  return {
    result:          isWin ? 'win' : 'loss',
    payout:          isWin ? 36 * chipsPerNumber : 0,
    profit:          isWin ? 15 * chipsPerNumber : -totalChips,
    chips:           totalChips,
    multiplier:      currentStep,
    systemType:      'JACOBO',
    betSectors:      null,
    jacoboActive:    true,
    jacoboConfidence: confidence,
    jacoboReason:    reason,
  };
}
