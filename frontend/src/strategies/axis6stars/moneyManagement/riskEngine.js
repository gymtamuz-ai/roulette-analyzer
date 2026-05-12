// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESSION RISK ENGINE — Risk assessment for AXIS6Stars progression states
// ═══════════════════════════════════════════════════════════════════════════════

import { getProgressionEntry, MAX_PROGRESSION_STEP } from './axisProgression';
import { getProgressionPhase } from './progressionState';

// ─── Risk level definitions ───────────────────────────────────────────────────

export const PROGRESSION_RISK_LEVELS = {
  MINIMAL:  { level: 'MINIMAL',  color: 'text-green-400',  bg: 'bg-green-900/20',   border: 'border-green-700',  label: 'Mínimo',   icon: '🟢' },
  LOW:      { level: 'LOW',      color: 'text-blue-400',   bg: 'bg-blue-900/20',    border: 'border-blue-700',   label: 'Bajo',     icon: '🔵' },
  MODERATE: { level: 'MODERATE', color: 'text-yellow-400', bg: 'bg-yellow-900/20',  border: 'border-yellow-700', label: 'Moderado', icon: '🟡' },
  HIGH:     { level: 'HIGH',     color: 'text-orange-400', bg: 'bg-orange-900/20',  border: 'border-orange-700', label: 'Alto',     icon: '🟠' },
  CRITICAL: { level: 'CRITICAL', color: 'text-red-400',    bg: 'bg-red-900/20',     border: 'border-red-700',    label: 'Crítico',  icon: '🔴' },
  STOP:     { level: 'STOP',     color: 'text-red-300',    bg: 'bg-red-950/40',     border: 'border-red-500',    label: '⛔ DETENER', icon: '⛔' },
};

// ─── Step-based risk ──────────────────────────────────────────────────────────

/**
 * Assess risk level based solely on progression step.
 */
export function assessProgressionRisk(step) {
  if (step >= MAX_PROGRESSION_STEP) return PROGRESSION_RISK_LEVELS.STOP;
  if (step >= 16) return PROGRESSION_RISK_LEVELS.CRITICAL;
  if (step >= 13) return PROGRESSION_RISK_LEVELS.HIGH;
  if (step >= 10) return PROGRESSION_RISK_LEVELS.MODERATE;
  if (step >= 5)  return PROGRESSION_RISK_LEVELS.LOW;
  return PROGRESSION_RISK_LEVELS.MINIMAL;
}

/**
 * Human-readable recommendation for the current risk level.
 */
export function getRiskRecommendation(step, riskLevel) {
  if (riskLevel === 'STOP')     return 'Detener sesión. Límite de progresión alcanzado.';
  if (riskLevel === 'CRITICAL') return 'Considerar pausa. Exposición muy alta. Solo continuar con bankroll suficiente.';
  if (riskLevel === 'HIGH')     return 'Alta exposición. Confirmar bankroll antes de continuar.';
  if (riskLevel === 'MODERATE') return 'Exposición moderada. Monitorear de cerca.';
  if (riskLevel === 'LOW')      return 'Riesgo manejable. Progresión en marcha.';
  return 'Nivel mínimo. Exploración segura.';
}

// ─── Risk of ruin ─────────────────────────────────────────────────────────────

/**
 * Compute probability of exhausting the full progression table from current step.
 *
 * AXIS covers 6 of 37 numbers → P(win) = 6/37 ≈ 16.22%, P(loss) = 31/37 ≈ 83.78%.
 * P(reaching end) ≈ P(losing all remaining steps) = (31/37)^stepsLeft.
 * This is an optimistic lower bound (ignores intra-cycle structure).
 */
export function computeRiskOfRuin(step) {
  const stepsLeft = MAX_PROGRESSION_STEP - step;
  if (stepsLeft <= 0) return { stepsLeft: 0, pRuinPercent: 100, label: 'Agotado' };

  const pLoss        = 31 / 37;
  const pRuin        = Math.pow(pLoss, stepsLeft);
  const pRuinPercent = parseFloat((pRuin * 100).toFixed(3));

  return {
    stepsLeft,
    pRuinPercent,
    label: pRuin > 0.50 ? 'Muy Alto' : pRuin > 0.10 ? 'Alto' : pRuin > 0.01 ? 'Moderado' : 'Bajo',
  };
}

// ─── Session stop criteria ────────────────────────────────────────────────────

/**
 * Determine if the session should be stopped based on risk conditions.
 *
 * @param {number} step
 * @param {number} consecutiveLosses
 * @param {object} options
 * @param {number} [options.maxStep=20]              - stop threshold (default: table end)
 * @param {number} [options.maxConsecutiveLosses=19] - abort if losing this many in a row
 */
export function shouldStopSession(step, consecutiveLosses, options = {}) {
  const { maxStep = MAX_PROGRESSION_STEP, maxConsecutiveLosses = 19 } = options;
  const reasons = [];

  if (step >= maxStep)
    reasons.push(`Progresión completa (step ${step}/${maxStep})`);
  if (consecutiveLosses >= maxConsecutiveLosses)
    reasons.push(`${consecutiveLosses} pérdidas consecutivas seguidas`);

  return { shouldStop: reasons.length > 0, reasons };
}

// ─── Bankroll risk ────────────────────────────────────────────────────────────

/**
 * Compute what percentage of the bankroll is at risk this spin and overall.
 *
 * @param {number} step
 * @param {number} bankrollChips - total chips available (0 = unknown)
 * @param {number} betCount      - numbers covered (default 6)
 */
export function computeBankrollRisk(step, bankrollChips, betCount = 6) {
  if (!bankrollChips || bankrollChips <= 0) return null;

  const entry      = getProgressionEntry(step);
  const thisBet    = entry.chips * betCount;
  const totalRemaining = entry.exposure; // worst-case from here

  return {
    thisBetChips:          thisBet,
    thisBetPct:            parseFloat((thisBet / bankrollChips * 100).toFixed(1)),
    remainingExposureChips: totalRemaining,
    remainingPct:          parseFloat((totalRemaining / bankrollChips * 100).toFixed(1)),
    canSurviveToEnd:       bankrollChips >= totalRemaining,
  };
}

// ─── Full composite assessment ────────────────────────────────────────────────

/**
 * Full risk assessment combining step risk, phase, ruin probability,
 * stop criteria, and optional bankroll risk.
 *
 * @param {number} step
 * @param {number} consecutiveLosses
 * @param {number} [bankrollChips=0]
 * @param {number} [betCount=6]
 */
export function assessFullRisk(step, consecutiveLosses, bankrollChips = 0, betCount = 6) {
  const risk   = assessProgressionRisk(step);
  const phase  = getProgressionPhase(step);
  const ruin   = computeRiskOfRuin(step);
  const stop   = shouldStopSession(step, consecutiveLosses);
  const bkRisk = bankrollChips > 0
    ? computeBankrollRisk(step, bankrollChips, betCount)
    : null;

  return {
    risk,
    phase,
    ruin,
    stop,
    bankrollRisk: bkRisk,
    summary: {
      level:          risk.level,
      color:          risk.color,
      label:          risk.label,
      icon:           risk.icon,
      shouldStop:     stop.shouldStop,
      stopReasons:    stop.reasons,
      recommendation: getRiskRecommendation(step, risk.level),
    },
  };
}
