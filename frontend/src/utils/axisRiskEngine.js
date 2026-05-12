// ═══════════════════════════════════════════════════════════════════════════════
// AXIS RISK ENGINE — Phase 4
// Gestión dinámica de riesgo:
//   - drawdown protection (4 niveles)
//   - exposure control (multiplicador de exposición)
//   - bankroll management (flat / proportional / conservative)
//   - risk level global
//
// NO implementa:
//   ❌ martingala
//   ❌ modificación automática de apuestas (solo recomendaciones)
//   ❌ stops automáticos sin confirmación del usuario
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Thresholds de drawdown ───────────────────────────────────────────────────
const DD_CAUTION  =  3;   // chips
const DD_WARNING  =  6;
const DD_CRITICAL = 10;

// ─── Bankroll modes ───────────────────────────────────────────────────────────
export const BANKROLL_MODES = {
  flat:           { label: 'Flat (estándar)',       desc: '1 ficha por número siempre' },
  proportional:   { label: 'Proporcional',          desc: 'Escala con confidence (×0.5–×1.5)' },
  conservative:   { label: 'Conservador',           desc: 'Solo reduce nunca aumenta (×0.5–×1)' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DRAWDOWN LEVEL
// ═══════════════════════════════════════════════════════════════════════════════
export function computeDrawdownLevel(maxDrawdown = 0, currentBalance = 0) {
  // Usar el mayor entre el drawdown máximo y la pérdida actual
  const effectiveLoss = Math.max(maxDrawdown, Math.max(0, -currentBalance));

  if (effectiveLoss >= DD_CRITICAL) return 'critical';
  if (effectiveLoss >= DD_WARNING)  return 'warning';
  if (effectiveLoss >= DD_CAUTION)  return 'caution';
  return 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DRAWDOWN PROTECTION
//    Determina qué restricciones aplican según el nivel de drawdown.
// ═══════════════════════════════════════════════════════════════════════════════
const DD_ACTIONS = {
  none:     { pauseAxis: false, cooldownBonus: 0, exposureMultiplier: 1.00, confidenceGate: 40, label: '—',          color: 'text-gray-500' },
  caution:  { pauseAxis: false, cooldownBonus: 1, exposureMultiplier: 0.75, confidenceGate: 50, label: 'Precaución', color: 'text-yellow-400' },
  warning:  { pauseAxis: false, cooldownBonus: 2, exposureMultiplier: 0.50, confidenceGate: 60, label: 'Advertencia',color: 'text-orange-400' },
  critical: { pauseAxis: true,  cooldownBonus: 4, exposureMultiplier: 0.25, confidenceGate: 75, label: 'Crítico',    color: 'text-red-400' },
};

export function computeDrawdownProtection(analytics) {
  const {
    maxDrawdown    = 0,
    currentBalance = 0,
  } = analytics ?? {};

  const level  = computeDrawdownLevel(maxDrawdown, currentBalance);
  const action = DD_ACTIONS[level];

  return {
    level,
    ...action,
    maxDrawdown,
    currentBalance,
    message: level === 'none'
      ? null
      : level === 'caution'  ? `Drawdown ${maxDrawdown} fchs — reducir exposición ${Math.round((1 - action.exposureMultiplier) * 100)}%`
      : level === 'warning'  ? `Drawdown ${maxDrawdown} fchs — exposición −50%, cooldown +2`
      : `Drawdown crítico ${maxDrawdown} fchs — AXIS bloqueado en AUTO`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. EXPOSURE MULTIPLIER
//    Combina drawdown + confidence para calcular el multiplicador de exposición.
//    1.0 = standard / <1.0 = reducido / >1.0 = aumentado (solo en flat mode)
// ═══════════════════════════════════════════════════════════════════════════════
export function computeExposureMultiplier(ddProtection, confidence, bankrollMode = 'flat') {
  const ddMultiplier = ddProtection?.exposureMultiplier ?? 1.0;

  if (bankrollMode === 'flat') {
    // Flat: siempre 1× (pero se reduce por drawdown)
    return Math.min(1.0, ddMultiplier);
  }

  if (bankrollMode === 'proportional') {
    // Escala con confidence: 40% conf → ×0.5, 70% → ×1.0, 90% → ×1.5
    const confMultiplier = Math.max(0.5, Math.min(1.5, (confidence - 40) / 50 + 0.75));
    return parseFloat(Math.min(1.5, confMultiplier * ddMultiplier).toFixed(2));
  }

  if (bankrollMode === 'conservative') {
    // Nunca sube de 1×, baja con confidence baja o drawdown
    const confMultiplier = Math.max(0.5, Math.min(1.0, confidence / 70));
    return parseFloat(Math.min(1.0, confMultiplier * ddMultiplier).toFixed(2));
  }

  return 1.0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BANKROLL RECOMMENDATION
//    Calcula la apuesta recomendada basada en modo y estado de riesgo.
//    NO modifica el motor — solo muestra al usuario qué debería apostar.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeBankrollRecommendation(betNumbers, ddProtection, confidence, bankrollMode = 'flat') {
  if (!betNumbers || betNumbers.length === 0) {
    return { chips: 0, perNumber: 0, multiplier: 1.0, mode: bankrollMode, note: null };
  }

  const multiplier = computeExposureMultiplier(ddProtection, confidence, bankrollMode);
  const baseNumbers = betNumbers.length;

  // Número recomendado de fichas totales
  const recommendedChips = Math.max(1, Math.round(baseNumbers * multiplier));

  let note = null;
  if (multiplier < 1.0) {
    note = `Reducido ${Math.round((1 - multiplier) * 100)}% por ${
      ddProtection.level !== 'none' ? 'drawdown' : 'confianza baja'
    }`;
  } else if (multiplier > 1.0) {
    note = `Aumentado ×${multiplier} por alta confianza`;
  }

  return {
    chips:      recommendedChips,
    perNumber:  parseFloat((recommendedChips / baseNumbers).toFixed(2)),
    multiplier,
    mode:       bankrollMode,
    note,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. GLOBAL RISK LEVEL
//    Semáforo de riesgo global (para UI).
// ═══════════════════════════════════════════════════════════════════════════════
export function computeRiskLevel(ddProtection, antiOvertrade, confidence) {
  if (ddProtection?.level === 'critical' || antiOvertrade?.blocked) {
    return { level: 'critical', color: 'text-red-400',    bg: 'bg-red-900/20',    label: '🔴 Riesgo crítico' };
  }
  if (ddProtection?.level === 'warning') {
    return { level: 'high',     color: 'text-orange-400', bg: 'bg-orange-900/20', label: '🟠 Riesgo alto' };
  }
  if (ddProtection?.level === 'caution' || (confidence < 45 && confidence > 0)) {
    return { level: 'medium',   color: 'text-yellow-400', bg: 'bg-yellow-900/10', label: '🟡 Riesgo medio' };
  }
  return { level: 'low',      color: 'text-green-400',  bg: 'bg-green-900/10',  label: '🟢 Riesgo bajo' };
}
