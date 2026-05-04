// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA JACOBO PRO — Backend
// (lógica idéntica al frontend/src/utils/jacobo.js — CommonJS)
// ═══════════════════════════════════════════════════════════════════════════════

const JACOBO_NUMBERS = [
  0, 3, 7, 12, 15, 18,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
];
const JACOBO_SET = new Set(JACOBO_NUMBERS);

const JACOBO_PRO_PROGRESSION = [
  { step: 1, chipsPerNumber: 1,  totalChips: 21   },
  { step: 2, chipsPerNumber: 2,  totalChips: 42   },
  { step: 3, chipsPerNumber: 5,  totalChips: 105  },
  { step: 4, chipsPerNumber: 12, totalChips: 252  },
  { step: 5, chipsPerNumber: 29, totalChips: 609  },
  { step: 6, chipsPerNumber: 70, totalChips: 1470 },
];

const PRE_ANALYSIS_WINDOW     = 20;
const RISK_WINDOW             = 50;
const RISK_HIT_RATE_THRESHOLD = 0.40;
const BLOCK_SPINS             = 10;
const CYCLES_TO_BLOCK         = 2;
const COND_A_TOP12_MIN        = 5;
const COND_B_RECENT_MAX       = 6;
const COND_DEACTIVATE_RECENT  = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function computeDelays(spins) {
  const delays = new Map();
  for (let n = 0; n <= 36; n++) {
    let delay = spins.length;
    for (let i = spins.length - 1; i >= 0; i--) {
      if (spins[i].number === n) { delay = spins.length - 1 - i; break; }
    }
    delays.set(n, delay);
  }
  return delays;
}

function evaluateJacoboOpportunity(spins) {
  if (spins.length < PRE_ANALYSIS_WINDOW) {
    return { shouldActivate: false, reason: `Faltan ${PRE_ANALYSIS_WINDOW - spins.length} tiradas`, confidence: 0 };
  }

  const recent20   = spins.slice(-PRE_ANALYSIS_WINDOW);
  const recentHits = recent20.filter(s => JACOBO_SET.has(s.number)).length;

  if (recentHits >= COND_DEACTIVATE_RECENT) {
    return { shouldActivate: false, reason: `Alta frecuencia reciente (${recentHits}/20)`, confidence: 0, recentHits };
  }

  const delays         = computeDelays(spins);
  const setDelays      = JACOBO_NUMBERS.map(n => delays.get(n));
  const avgSetDelay    = setDelays.reduce((a, b) => a + b, 0) / setDelays.length;
  const allDelays      = Array.from({ length: 37 }, (_, n) => delays.get(n));
  const avgGlobalDelay = allDelays.reduce((a, b) => a + b, 0) / allDelays.length;

  const sorted  = Array.from({ length: 37 }, (_, n) => ({ n, d: delays.get(n) })).sort((a, b) => b.d - a.d);
  const top12   = new Set(sorted.slice(0, 12).map(x => x.n));
  const inTop12 = JACOBO_NUMBERS.filter(n => top12.has(n)).length;

  const condA = inTop12 >= COND_A_TOP12_MIN;
  const condB = recentHits <= COND_B_RECENT_MAX;
  const condC = avgSetDelay > avgGlobalDelay;
  const shouldActivate = condA || condB || condC;

  let confidence = 0;
  if (condA) confidence += 40;
  if (condB) confidence += 35;
  if (condC) confidence += 25;
  confidence = Math.min(100, confidence);

  let reason = 'Sin ventaja estadística clara';
  if (!shouldActivate) {
    reason = `Distribución uniforme (${recentHits}/20 · atraso ${avgSetDelay.toFixed(1)})`;
  } else if (condA && condB) {
    reason = `${inTop12} en TOP-12 + solo ${recentHits}/20 recientes`;
  } else if (condA) {
    reason = `${inTop12} números en TOP-12 atrasados`;
  } else if (condB) {
    reason = `Atraso: solo ${recentHits} hits en últimas 20`;
  } else {
    reason = `Atraso promedio set ${avgSetDelay.toFixed(1)} > global ${avgGlobalDelay.toFixed(1)}`;
  }

  return { shouldActivate, reason, confidence, condA, condB, condC, recentHits, inTop12 };
}

function evaluateRisk(spins) {
  const window = Math.min(spins.length, RISK_WINDOW);
  if (window < 20) return { isHighRisk: false, reason: '', hitRate: null };
  const hits    = spins.slice(-window).filter(s => JACOBO_SET.has(s.number)).length;
  const hitRate = hits / window;
  const isHighRisk = hitRate < RISK_HIT_RATE_THRESHOLD;
  return {
    isHighRisk,
    reason: isHighRisk ? `Hit rate ${(hitRate * 100).toFixed(0)}% en últ.${window}` : '',
    hitRate: parseFloat(hitRate.toFixed(3)),
  };
}

// ─── Motor de estado ──────────────────────────────────────────────────────────
function computeJacoboState(spins) {
  if (!spins) spins = [];

  let stepIdx               = 0;
  let consecutiveLostCycles = 0;
  let blockedUntil          = -1;
  let cyclesCompleted       = 0;
  let cyclesAborted         = 0;
  let currentCycleInvested  = 0;
  let currentCycleHistory   = [];

  for (let i = 0; i < spins.length; i++) {
    if (i <= blockedUntil) continue;
    if (i < PRE_ANALYSIS_WINDOW) continue;

    const opp  = evaluateJacoboOpportunity(spins.slice(0, i));
    const risk = evaluateRisk(spins.slice(0, i));
    if (!opp.shouldActivate || risk.isHighRisk) continue;

    const step  = JACOBO_PRO_PROGRESSION[stepIdx];
    const isWin = JACOBO_SET.has(spins[i].number);

    currentCycleInvested += step.totalChips;
    currentCycleHistory.push({ step: step.step, result: isWin ? 'win' : 'loss' });

    if (isWin) {
      cyclesCompleted++;
      consecutiveLostCycles = 0;
      stepIdx = 0; currentCycleInvested = 0; currentCycleHistory = [];
    } else if (stepIdx >= JACOBO_PRO_PROGRESSION.length - 1) {
      cyclesAborted++;
      consecutiveLostCycles++;
      stepIdx = 0; currentCycleInvested = 0; currentCycleHistory = [];
      if (consecutiveLostCycles >= CYCLES_TO_BLOCK) {
        blockedUntil = i + BLOCK_SPINS;
        consecutiveLostCycles = 0;
      }
    } else {
      stepIdx++;
    }
  }

  const lastIdx    = spins.length - 1;
  const curProgRow = JACOBO_PRO_PROGRESSION[stepIdx];

  if (spins.length > 0 && lastIdx <= blockedUntil) {
    return {
      status: 'BLOCKED', isActive: false, isBlocked: true,
      reason: `Bloqueado: 2 ciclos perdidos (${blockedUntil - lastIdx} tiradas restantes)`,
      confidence: 0, currentStep: curProgRow.step,
      chipsPerNumber: curProgRow.chipsPerNumber, totalChips: curProgRow.totalChips,
      cyclesCompleted, cyclesAborted, currentCycleInvested,
    };
  }

  if (spins.length < PRE_ANALYSIS_WINDOW) {
    return {
      status: 'INACTIVE', isActive: false, isBlocked: false,
      reason: `Faltan ${PRE_ANALYSIS_WINDOW - spins.length} tiradas`,
      confidence: 0, cyclesCompleted, cyclesAborted,
    };
  }

  const opportunity = evaluateJacoboOpportunity(spins);
  const risk        = evaluateRisk(spins);

  if (risk.isHighRisk) {
    return {
      status: 'BLOCKED', isActive: false, isBlocked: true,
      reason: `Riesgo alto: ${risk.reason}`, confidence: 0,
      currentStep: curProgRow.step,
      chipsPerNumber: curProgRow.chipsPerNumber, totalChips: curProgRow.totalChips,
      cyclesCompleted, cyclesAborted, currentCycleInvested,
    };
  }

  if (!opportunity.shouldActivate) {
    return {
      status: 'INACTIVE', isActive: false, isBlocked: false,
      reason: opportunity.reason, confidence: opportunity.confidence,
      currentStep: curProgRow.step,
      chipsPerNumber: curProgRow.chipsPerNumber, totalChips: curProgRow.totalChips,
      cyclesCompleted, cyclesAborted, currentCycleInvested,
    };
  }

  return {
    status: 'ACTIVE', isActive: true, isBlocked: false,
    reason: opportunity.reason, confidence: opportunity.confidence,
    currentStep: curProgRow.step,
    chipsPerNumber: curProgRow.chipsPerNumber,
    totalChips: curProgRow.totalChips,
    netProfitIfWin: 15 * curProgRow.chipsPerNumber - currentCycleInvested,
    isLastStep: stepIdx === JACOBO_PRO_PROGRESSION.length - 1,
    cyclesCompleted, cyclesAborted, currentCycleInvested,
  };
}

// ─── Resultado de apuesta ─────────────────────────────────────────────────────
function calculateJacoboBetResult(jacoboState, spinNumber) {
  if (!jacoboState || !jacoboState.isActive) return null;
  const { chipsPerNumber, totalChips, confidence, reason, currentStep } = jacoboState;
  const isWin = JACOBO_SET.has(spinNumber);
  return {
    result:           isWin ? 'win' : 'loss',
    payout:           isWin ? 36 * chipsPerNumber : 0,
    profit:           isWin ? 15 * chipsPerNumber : -totalChips,
    chips:            totalChips,
    multiplier:       currentStep,
    systemType:       'JACOBO',
    betSectors:       null,
    jacoboActive:     true,
    jacoboConfidence: confidence,
    jacoboReason:     reason,
  };
}

module.exports = {
  computeJacoboState, calculateJacoboBetResult,
  evaluateJacoboOpportunity, evaluateRisk,
  JACOBO_NUMBERS, JACOBO_PRO_PROGRESSION,
};
