// ═══════════════════════════════════════════════════════════════════════════════
// AXIS INTELLIGENCE ENGINE — Phase 3
// Motor cuantitativo adaptativo:
//   - confidence scoring multi-factor
//   - convergencia multi-sistema
//   - dealer signature (clustering estadístico)
//   - wheel bias confidence
//   - smart cooldown
//   - anti-overtrading filters
//   - session analytics
//   - temporal persistence
//
// TODO-bloqueados intencionalmente:
//   ❌ machine learning / redes neuronales
//   ❌ APIs externas
//   ❌ optimización genética
//   ❌ modelos opacos
// ═══════════════════════════════════════════════════════════════════════════════

import { NUMBER_TO_H, NUMBER_TO_V } from './axis';
import { findMemoryRow, computeDecayWeight } from './axisHistory';
import { computeSignalQuality, classifyWheelProfile } from './axisSignalQuality';

// ─── Parámetros globales ──────────────────────────────────────────────────────
const VOLATILITY_WINDOW               = 18;
const DEALER_SIG_WINDOW               = 36;
const CONFIDENCE_MIN_TO_BET           = 40;
const ANTI_OVERTRADE_CONSEC_ABORTS    = 3;
const ANTI_OVERTRADE_MAX_DRAWDOWN     = 10;
const MIN_HISTORY_FOR_CLASSIFICATION  = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// A) VOLATILIDAD DE MESA
//    0 = muy clusterizada (fácil de predecir)
//    1 = totalmente uniforme/ruidosa (difícil)
// ═══════════════════════════════════════════════════════════════════════════════
export function computeVolatility(spins) {
  const recent = spins.slice(-VOLATILITY_WINDOW).filter(s => s.number !== 0);
  if (recent.length < 6) return 0.5; // sin datos: neutro

  const hCounts = [0, 0, 0, 0, 0, 0];
  for (const s of recent) {
    const h = NUMBER_TO_H[s.number];
    if (h) hCounts[h - 1]++;
  }

  const n        = recent.length;
  const expected = n / 6;

  // Chi-cuadrado vs distribución uniforme
  const chi2 = hCounts.reduce((sum, c) => sum + (expected > 0 ? Math.pow(c - expected, 2) / expected : 0), 0);
  // chi2(df=5) crit 5% = 11.07; 1% = 15.09
  // Alto chi2 = clustering = baja volatilidad
  const normalizedChi2 = Math.min(1, chi2 / 15);
  return parseFloat((1 - normalizedChi2).toFixed(3)); // 1 = muy uniforme (volátil)
}

// ═══════════════════════════════════════════════════════════════════════════════
// B) TRIGGER STRENGTH
//    Qué tan fuerte es el trigger que acaba de dispararse.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeTriggerStrength(axisState, spins) {
  if (!axisState?.isActive) return 0;

  const { status, triggeredH, triggeredV, debugLog = [] } = axisState;
  let base = 0;

  if (status === 'TRIGGERED_ECLIPSE') {
    base = 85; // ambos H y V convergieron → máxima precisión
  } else {
    // Detectar si fue trigger primario (2/3) o secundario (3/6)
    const lastTrig = [...debugLog].reverse().find(l => l.includes('Trigger'));
    const isSecondary = lastTrig && lastTrig.includes('/6');
    base = isSecondary ? 45 : 62;
  }

  // Bonus: densidad reciente en el sector triggereado
  const recent3 = spins.slice(-3).filter(s => s.number !== 0);
  let extraHits = 0;
  for (const s of recent3) {
    const h = NUMBER_TO_H[s.number];
    const v = NUMBER_TO_V[s.number];
    if ((triggeredH && h === triggeredH) || (triggeredV && v === triggeredV)) extraHits++;
  }
  if (extraHits >= 3)     base += 12;
  else if (extraHits >= 2) base +=  5;

  return Math.min(100, base);
}

// ═══════════════════════════════════════════════════════════════════════════════
// C) DEALER SIGNATURE
//    Detecta clustering estadístico de zonas en las últimas 36 tiradas.
//    NO afirma "el dealer hace trampa" — solo "hay clustering sostenido".
// ═══════════════════════════════════════════════════════════════════════════════
export function computeDealerSignature(spins) {
  const recent = spins.slice(-DEALER_SIG_WINDOW).filter(s => s.number !== 0);
  if (recent.length < 12) {
    return { score: 0, level: 'none', description: 'Datos insuficientes', dominantH: null, chi2: '0.0' };
  }

  const hCounts = [0, 0, 0, 0, 0, 0];
  for (const s of recent) {
    const h = NUMBER_TO_H[s.number];
    if (h) hCounts[h - 1]++;
  }

  const n        = recent.length;
  const expected = n / 6;
  const chi2     = hCounts.reduce((sum, c) => sum + (expected > 0 ? Math.pow(c - expected, 2) / expected : 0), 0);

  // Tablas chi2 (df=5): 0.05 → 11.07 / 0.01 → 15.09
  let score, level, description;
  if (chi2 < 4) {
    score       = Math.round(chi2 / 4 * 15);
    level       = 'none';
    description = 'Distribución uniforme — sin firma detectable';
  } else if (chi2 < 11.07) {
    score       = 15 + Math.round((chi2 - 4) / 7 * 30);
    level       = 'weak';
    description = 'Firma débil — posible clustering transitorio';
  } else if (chi2 < 15.09) {
    score       = 45 + Math.round((chi2 - 11.07) / 4 * 25);
    level       = 'moderate';
    description = 'Firma moderada — zona persistente confirmada (p<0.05)';
  } else {
    score       = Math.min(100, 70 + Math.round((chi2 - 15.09) / 5 * 30));
    level       = 'strong';
    description = 'Firma fuerte — sector dominante sostenido (p<0.01)';
  }

  const maxCount  = Math.max(...hCounts);
  const dominantH = hCounts.indexOf(maxCount) + 1;

  return { score, level, description, dominantH, chi2: chi2.toFixed(1) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// D) WHEEL BIAS CONFIDENCE
//    Evidencia estadística acumulada de sesgo en rueda/distribuidora.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeWheelBiasConfidence(spins, memoryRows = []) {
  let score   = 0;
  const parts = [];

  // 1. Dealer signature reciente (40%)
  const dealer = computeDealerSignature(spins);
  const dealerContrib = Math.round(dealer.score * 0.40);
  score += dealerContrib;
  if (dealer.level !== 'none') parts.push(`Clustering ${dealer.level}`);

  // 2. Persistencia histórica de sectores HOT (35%)
  if (memoryRows.length > 0) {
    const qualified = memoryRows.filter(r => r.total_cycles >= 8);
    if (qualified.length > 0) {
      const hotCount  = qualified.filter(r => r.wins / r.total_cycles > 0.55).length;
      const hotRatio  = hotCount / qualified.length;
      const memContrib = Math.round(hotRatio * 100 * 0.35);
      score += memContrib;
      if (hotRatio > 0.25) parts.push(`${hotCount} sectores HOT históricos`);
    }
  }

  // 3. Recurrencia de eclipses (25%)
  if (memoryRows.length > 0) {
    const eclipseRows = memoryRows.filter(r => r.sector_type === 'E' && r.total_cycles >= 3);
    if (eclipseRows.length > 0) {
      const eclipseContrib = Math.min(25, eclipseRows.length * 8);
      score += Math.round(eclipseContrib * 0.25);
      if (eclipseRows.length >= 2) parts.push(`${eclipseRows.length} eclipses recurrentes`);
    }
  }

  score = Math.round(Math.min(100, score));

  let level = 'none';
  if (score >= 70)      level = 'strong';
  else if (score >= 45) level = 'moderate';
  else if (score >= 20) level = 'weak';

  return { score, level, reasons: parts };
}

// ═══════════════════════════════════════════════════════════════════════════════
// E) CONVERGENCIA MULTI-SISTEMA
//    Cuánto coinciden otros sistemas con el trigger AXIS actual.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeConvergenceScore(axisState, {
  vecinosState = null,
  hotNumbers   = [],
  mirrorState  = null,
  memoryRows   = [],
} = {}) {
  if (!axisState?.isActive) {
    return { score: 0, systems: [], label: 'Sin trigger' };
  }

  const { betNumbers = [], status, triggeredH, triggeredV, aceNumber } = axisState;
  const systems = [];
  let score     = 0;

  // 1. HOT NUMBERS overlap (hasta 20 pts)
  if (hotNumbers.length > 0) {
    const hotSet  = new Set(hotNumbers.map(h => typeof h === 'object' ? (h.num ?? h.number) : h));
    const overlap = betNumbers.filter(n => hotSet.has(n));
    if (overlap.length > 0) {
      const pts = Math.min(20, overlap.length * 6);
      score += pts;
      systems.push({ name: 'HOT', score: pts, detail: `${overlap.length} núm. coinciden` });
    }
  }

  // 2. VECINOS zone overlap (hasta 30 pts)
  const vecinosNums = vecinosState?.zone?.numbers ?? vecinosState?.numbers ?? [];
  if (vecinosNums.length > 0) {
    const vecinosSet = new Set(vecinosNums);
    const overlap    = betNumbers.filter(n => vecinosSet.has(n));
    if (overlap.length > 0) {
      const pts = Math.min(30, overlap.length * 9);
      score += pts;
      systems.push({ name: 'VECINOS', score: pts, detail: `${overlap.length} núm. zona VECINOS` });
    }
  }

  // 3. Historical sector performance (hasta 25 pts)
  let memRow = null;
  if (status === 'TRIGGERED_ECLIPSE')      memRow = findMemoryRow(memoryRows, 'E', aceNumber);
  else if (status === 'TRIGGERED_H')       memRow = findMemoryRow(memoryRows, 'H', triggeredH);
  else if (status === 'TRIGGERED_V')       memRow = findMemoryRow(memoryRows, 'V', triggeredV);

  if (memRow && memRow.total_cycles >= MIN_HISTORY_FOR_CLASSIFICATION) {
    const winrate = memRow.wins / memRow.total_cycles;
    const decay   = computeDecayWeight(memRow.last_seen_at);
    const pts     = Math.round(winrate * 25 * decay);
    if (pts > 4) {
      score += pts;
      systems.push({ name: 'HIST', score: pts, detail: `${(winrate * 100).toFixed(0)}% hist. (decay ×${decay.toFixed(1)})` });
    }
  }

  // 4. ECLIPSE precision bonus (20 pts fijos)
  if (status === 'TRIGGERED_ECLIPSE') {
    score += 20;
    systems.push({ name: 'ECLIPSE', score: 20, detail: 'H×V intersección precisa' });
  }

  // 5. ESPEJO activo en misma sesión (+8 pts)
  if (mirrorState?.isActive) {
    score += 8;
    systems.push({ name: 'ESPEJO', score: 8, detail: 'Espejo activo' });
  }

  score = Math.min(100, score);

  let label = 'Local';
  if (score >= 60)      label = 'Convergencia fuerte';
  else if (score >= 35) label = 'Convergencia moderada';
  else if (score >= 15) label = 'Convergencia débil';

  return { score, systems, label };
}

// ═══════════════════════════════════════════════════════════════════════════════
// F) SESSION ANALYTICS
//    Métricas de la sesión actual para AXIS.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeAxisSessionAnalytics(results = []) {
  const axisResults = results.filter(r => r.system_type === 'AXIS' || r.systemType === 'AXIS');
  const total  = axisResults.length;
  const wins   = axisResults.filter(r => r.result === 'win').length;
  const losses = total - wins;

  const totalProfit  = axisResults.reduce((s, r) => s + (r.profit ?? 0), 0);
  const totalWagered = axisResults.reduce((s, r) => s + (r.bet_chips ?? r.chips ?? 0), 0);

  // Streaks
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const r of axisResults) {
    if (r.result === 'win') { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
    else                    { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
  }

  // Drawdown
  let peak = 0, maxDrawdown = 0, running = 0;
  for (const r of axisResults) {
    running += r.profit ?? 0;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Profit factor
  const grossWin  = axisResults.filter(r => r.result === 'win')
    .reduce((s, r) => s + Math.max(0, r.profit ?? 0), 0);
  const grossLoss = axisResults.filter(r => r.result !== 'win')
    .reduce((s, r) => s + Math.abs(Math.min(0, r.profit ?? 0)), 0);
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2)
                     : grossWin > 0  ? '∞' : '0';

  return {
    total, wins, losses,
    winrate:      total > 0 ? Math.round(wins / total * 100) : 0,
    totalProfit, totalWagered,
    roi:          totalWagered > 0 ? Math.round(totalProfit / totalWagered * 100) : 0,
    maxWinStreak, maxLossStreak, maxDrawdown, profitFactor,
    currentBalance: running,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// G) ABORTOS CONSECUTIVOS
//    Cuenta cuántos ciclos seguidos terminaron sin hit.
// ═══════════════════════════════════════════════════════════════════════════════
function computeConsecutiveAborts(axisState) {
  const log = axisState?.debugLog ?? [];
  let consecutive = 0;
  for (const line of [...log].reverse()) {
    if (line.includes('expirado') || line.includes('abortado') || line.includes('Abortos')) consecutive++;
    else if (line.includes('HIT') || line.includes('ganado')) break;
  }
  return consecutive;
}

// ═══════════════════════════════════════════════════════════════════════════════
// H) ANTI-OVERTRADING
// ═══════════════════════════════════════════════════════════════════════════════
export function shouldAntiOvertrade(axisState, confidence, volatility, sessionDrawdown = 0) {
  const reasons = [];
  const consecutiveAborts = computeConsecutiveAborts(axisState);

  if (consecutiveAborts >= ANTI_OVERTRADE_CONSEC_ABORTS) {
    reasons.push(`${consecutiveAborts} abortos consecutivos — enfriamiento`);
  }
  if (confidence < CONFIDENCE_MIN_TO_BET && axisState?.isActive) {
    reasons.push(`Confianza ${confidence}% < umbral mínimo ${CONFIDENCE_MIN_TO_BET}%`);
  }
  if (volatility > 0.85) {
    reasons.push('Mesa extremadamente dispersa — señal poco confiable');
  }
  if (sessionDrawdown >= ANTI_OVERTRADE_MAX_DRAWDOWN) {
    reasons.push(`Drawdown ${sessionDrawdown} fichas — pausa recomendada`);
  }

  return {
    blocked: reasons.length > 0,
    reason:  reasons.join(' · '),
    reasons,
    consecutiveAborts,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// I) SMART COOLDOWN
//    Cooldown recomendado dinámico (en spins) después de un ciclo fallido.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeSmartCooldown(axisState, memoryRows = [], volatility = 0.5) {
  let cooldown = 1; // base: 1 spin (mismo que Phase 1)

  const consecutiveAborts = computeConsecutiveAborts(axisState);
  if (consecutiveAborts >= 3)      cooldown += 3;
  else if (consecutiveAborts >= 2) cooldown += 2;
  else if (consecutiveAborts >= 1) cooldown += 1;

  // Volatilidad alta → esperar más
  if (volatility > 0.80)      cooldown += 2;
  else if (volatility > 0.65) cooldown += 1;

  // Sector históricamente COLD → extender
  const { triggeredH, triggeredV, aceNumber, status } = axisState ?? {};
  let memRow = null;
  if (status === 'TRIGGERED_ECLIPSE')  memRow = findMemoryRow(memoryRows, 'E', aceNumber);
  else if (status === 'TRIGGERED_H')   memRow = findMemoryRow(memoryRows, 'H', triggeredH);
  else if (status === 'TRIGGERED_V')   memRow = findMemoryRow(memoryRows, 'V', triggeredV);

  if (memRow && memRow.total_cycles >= 8) {
    const abortRate = (memRow.total_cycles - memRow.wins) / memRow.total_cycles;
    if (abortRate > 0.65) cooldown += 2;
    else if (abortRate > 0.5) cooldown += 1;
  }

  return Math.min(7, cooldown);
}

// ═══════════════════════════════════════════════════════════════════════════════
// J) CONFIDENCE ENGINE
//    Score 0-100 basado en múltiples factores ponderados.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeAxisConfidence({
  axisState, memoryRows = [], convergenceScore = 0,
  triggerStrength = 0, volatility = 0.5, analytics = null,
}) {
  if (!axisState?.isActive) return 0;

  const { status, triggeredH, triggeredV, aceNumber } = axisState;

  // 1. Hitrate histórico (30%) — basado en axis_memory
  let hitrateBase = 50; // neutral para sectores nuevos
  let memRow = null;
  if (status === 'TRIGGERED_ECLIPSE')  memRow = findMemoryRow(memoryRows, 'E', aceNumber);
  else if (status === 'TRIGGERED_H')   memRow = findMemoryRow(memoryRows, 'H', triggeredH);
  else if (status === 'TRIGGERED_V')   memRow = findMemoryRow(memoryRows, 'V', triggeredV);

  if (memRow && memRow.total_cycles >= MIN_HISTORY_FOR_CLASSIFICATION) {
    const winrate = memRow.wins / memRow.total_cycles;
    const decay   = computeDecayWeight(memRow.last_seen_at);
    hitrateBase   = Math.round(winrate * 100 * decay);
  }

  // 2. Convergencia multi-sistema (25%)
  const convScore = Math.min(100, convergenceScore);

  // 3. Trigger strength (20%)
  const trigScore = Math.min(100, triggerStrength);

  // 4. Rendimiento sesión (15%)
  let sessionScore = 50; // neutral sin historial
  if (analytics && analytics.total >= 3) {
    // winrate ponderado por cantidad de ciclos
    sessionScore = Math.min(100, Math.max(0, analytics.winrate));
  }

  // 5. Volatilidad inversa (10%) — baja volatilidad = más confianza
  const volScore = Math.round((1 - volatility) * 100);

  const confidence = Math.round(
    hitrateBase  * 0.30 +
    convScore    * 0.25 +
    trigScore    * 0.20 +
    sessionScore * 0.15 +
    volScore     * 0.10
  );

  return Math.max(0, Math.min(100, confidence));
}

// ═══════════════════════════════════════════════════════════════════════════════
// K) MOTOR PRINCIPAL — computeAxisIntelligence
//    Une todos los módulos anteriores en un único objeto coherente.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeAxisIntelligence(spins, axisState, memoryRows = [], {
  vecinosState    = null,
  hotNumbers      = [],
  mirrorState     = null,
  results         = [],
  sessionDrawdown = 0,
} = {}) {
  const debugLog = [];

  if (!axisState) return _emptyIntelligence();

  // ── Core metrics ────────────────────────────────────────────────────────────
  const volatility    = computeVolatility(spins);
  const trigStrength  = computeTriggerStrength(axisState, spins);
  const dealerSig     = computeDealerSignature(spins);
  const wheelBias     = computeWheelBiasConfidence(spins, memoryRows);
  const convergence   = computeConvergenceScore(axisState, { vecinosState, hotNumbers, mirrorState, memoryRows });
  const analytics     = computeAxisSessionAnalytics(results);
  const smartCooldown = computeSmartCooldown(axisState, memoryRows, volatility);

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = computeAxisConfidence({
    axisState, memoryRows,
    convergenceScore: convergence.score,
    triggerStrength:  trigStrength,
    volatility, analytics,
  });

  // ── Anti-overtrading ─────────────────────────────────────────────────────
  const effectiveDrawdown = Math.max(sessionDrawdown, analytics.maxDrawdown);
  const antiOvertrade = shouldAntiOvertrade(axisState, confidence, volatility, effectiveDrawdown);

  // ── Debug log ────────────────────────────────────────────────────────────
  if (axisState.isActive) {
    debugLog.push(`[AXIS] Confidence ${confidence}%`);
    if (convergence.systems.length > 0) {
      debugLog.push(`[AXIS] Convergencia ${convergence.score}%: ${convergence.systems.map(s => s.name).join('+')} — ${convergence.label}`);
    }
    debugLog.push(`[AXIS] Trigger strength ${trigStrength}% · Volatilidad ${(volatility * 100).toFixed(0)}%`);
  }
  if (dealerSig.level !== 'none') {
    debugLog.push(`[AXIS] Dealer signature ${dealerSig.level} (χ²=${dealerSig.chi2}) — ${dealerSig.description}`);
  }
  if (wheelBias.level !== 'none') {
    debugLog.push(`[AXIS] Wheel bias confidence ${wheelBias.score}% (${wheelBias.level})`);
  }
  if (smartCooldown > 1) {
    debugLog.push(`[AXIS] Smart cooldown → ${smartCooldown} spins recomendados`);
  }
  if (antiOvertrade.blocked) {
    debugLog.push(`[AXIS] ⚠ Overtrade filter activo: ${antiOvertrade.reason}`);
  }

  // ── Signal Quality + Wheel Profile (Phase 4) ────────────────────────────
  // Build partial intel object first (safe — these functions accept any shape)
  const partialIntel = { volatility, wheelBiasConfidence: wheelBias, dealerSignature: dealerSig, convergence, antiOvertrade };
  const signalQuality = computeSignalQuality(axisState, partialIntel);
  const sessionCycles = (axisState.cyclesWon ?? 0) + (axisState.cyclesAborted ?? 0);
  const wheelProfile  = classifyWheelProfile(partialIntel, sessionCycles);

  if (signalQuality.score >= 55) debugLog.push(`[AXIS] Signal quality ${signalQuality.score}% (${signalQuality.label})`);
  if (wheelProfile.profile !== 'stable') debugLog.push(`[AXIS PRO] Wheel profile: ${wheelProfile.profile} — ${wheelProfile.desc}`);

  return {
    confidence,
    volatility,
    triggerStrength:      trigStrength,
    convergence,
    dealerSignature:      dealerSig,
    wheelBiasConfidence:  wheelBias,
    antiOvertrade,
    smartCooldown,
    sessionAnalytics:     analytics,
    signalQuality,
    wheelProfile,
    debugLog,
  };
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function _emptyIntelligence() {
  return {
    confidence: 0,
    volatility: 0.5,
    triggerStrength: 0,
    convergence:          { score: 0, systems: [], label: 'Sin datos' },
    dealerSignature:      { score: 0, level: 'none', description: '' },
    wheelBiasConfidence:  { score: 0, level: 'none', reasons: [] },
    antiOvertrade:        { blocked: false, reason: '', reasons: [], consecutiveAborts: 0 },
    smartCooldown: 1,
    sessionAnalytics: {
      total: 0, wins: 0, losses: 0, winrate: 0,
      totalProfit: 0, totalWagered: 0, roi: 0,
      maxWinStreak: 0, maxLossStreak: 0, maxDrawdown: 0,
      profitFactor: '0', currentBalance: 0,
    },
    signalQuality:  { score: 0, label: 'Sin datos', breakdown: {} },
    wheelProfile:   { profile: 'stable', icon: '🔵', color: 'text-blue-300', desc: 'Sin datos' },
    debugLog: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// L) SCORE PARA AUTO MODE (Phase 3 version)
//    Reemplaza scoreAxisSystem de axisHistory.js en autoSystem.js
// ═══════════════════════════════════════════════════════════════════════════════
export function scoreAxisSystemV3(spins, axisState, memoryRows = [], intelligence = null) {
  if (!axisState?.isActive) {
    return { score: 0, reason: 'AXIS: sin trigger activo' };
  }

  // Usar intelligence pre-computada o calcularla
  const intel = intelligence ?? computeAxisIntelligence(spins, axisState, memoryRows);

  // Si anti-overtrade bloqueó → score 0
  if (intel.antiOvertrade.blocked) {
    return { score: 0, reason: `AXIS bloqueado: ${intel.antiOvertrade.reason}` };
  }

  // Confidence como score base, ajustado por convergencia
  let score = Math.round(
    intel.confidence * 0.70 +
    intel.convergence.score * 0.30
  );

  // Penalización extra por abortos recientes en esta sesión
  if ((axisState.cyclesAborted ?? 0) >= 2 && (axisState.cyclesAborted ?? 0) > (axisState.cyclesWon ?? 0)) {
    score -= 15;
  }

  score = Math.max(0, Math.min(99, score));

  const { status } = axisState;
  const typeTag = status === 'TRIGGERED_ECLIPSE' ? '⭐ ECLIPSE'
                : status === 'TRIGGERED_H'       ? '↔ AXIS-H'
                : '↕ AXIS-V';
  const convTag = intel.convergence.score >= 35 ? ` · ${intel.convergence.label}` : '';

  return {
    score,
    reason: `${typeTag} — conf ${intel.confidence}%${convTag}`,
  };
}
