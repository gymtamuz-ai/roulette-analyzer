// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR DE DECISIÓN AUTOMÁTICO
// Evalúa los 3 sistemas y selecciona el más favorable
// ═══════════════════════════════════════════════════════════════════════════════

import { computeMirrorState }                                    from './mirror';
import { computeJacoboState, evaluateJacoboOpportunity }         from './jacobo';
import { computeBettingState }                                   from './roulette';
import { computeVecinosState, findHotZone, ANALYSIS_WINDOW as VECINOS_WIN } from './vecinos';
import { computeZonePersistence } from './vecinosAnalytics';

// ─── Constants ────────────────────────────────────────────────────────────────
export const MIN_SCORE_TO_BET   = 30;
export const SECTOR_EVAL_WINDOW = 30;
export const JACOBO_EVAL_WINDOW = 30;
const        MIRROR_WIN         = 10;
const        SYSTEM_PRIORITY    = { ESPEJO: 4, VECINOS: 3, SECTORES: 2, JACOBO: 1 };

// ─── Internal spin-value helpers ──────────────────────────────────────────────
function valueForMode(spin, mode) {
  if (mode === 'color')  { const c = spin.color;  return (c && c !== 'green') ? c : null; }
  if (mode === 'parity') { const p = spin.parity; return (p && p !== 'zero')  ? p : null; }
  if (mode === 'range')  { if (spin.number === 0) return null; return spin.number <= 18 ? 'low' : 'high'; }
  return null;
}

function computeStreakForMode(spins, mode) {
  let streakValue = null, streak = 0;
  for (let i = spins.length - 1; i >= 0; i--) {
    const v = valueForMode(spins[i], mode);
    if (v === null) continue;
    if (streakValue === null)   { streakValue = v; streak = 1; }
    else if (v === streakValue) { streak++; }
    else                        { break; }
  }
  return Math.max(0, streak - 1); // lossStreak = streak - 1
}

function isNoisyForMode(spins, mode) {
  const vals = spins.slice(-MIRROR_WIN).map(s => valueForMode(s, mode)).filter(v => v !== null);
  if (vals.length < 4) return false;
  let alt = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1]) alt++;
  return (alt / (vals.length - 1)) > 0.70;
}

// ─── A) Score Espejo ──────────────────────────────────────────────────────────
// +40 racha >= 4 · +25 racha == 3 · -20 patrón alternado
function scoreMirrorSystem(spins) {
  if (spins.length < MIRROR_WIN) {
    return { score: 0, reason: 'Espejo: tiradas insuficientes', mode: null, streak: 0 };
  }

  const modeLabels = { color: 'Color', parity: 'Paridad', range: 'Rango' };
  let best = { score: -Infinity, mode: null, streak: 0 };

  for (const mode of ['color', 'parity', 'range']) {
    const streak = computeStreakForMode(spins, mode);
    const noisy  = isNoisyForMode(spins, mode);
    let score = 0;
    if (streak >= 4)       score += 40;
    else if (streak === 3) score += 25;
    if (noisy)             score -= 20;
    if (score > best.score) best = { score, mode, streak, noisy };
  }

  const label = modeLabels[best.mode] || best.mode;
  let reason;
  if (best.streak >= 4)       reason = `Racha de ${best.streak} en ${label}`;
  else if (best.streak === 3) reason = `Racha mínima (3) en ${label}`;
  else                        reason = `Sin racha suficiente (máx ${best.streak})`;

  return { score: Math.max(0, best.score), mode: best.mode, streak: best.streak, reason };
}

// ─── B) Score Sectores A4 ────────────────────────────────────────────────────
// AUTO MODE usa exclusivamente A4. A3 queda fuera del motor automático.
// +40 dif > 8 · +25 dif > 5 · -15 distribución uniforme
function scoreSectorsSystem(spins) {
  const recent = spins.slice(-SECTOR_EVAL_WINDOW).filter(s => s.number !== 0);
  if (recent.length < 10) {
    return { score: 0, reason: 'A4: datos insuficientes', diff: 0, suggestedSystem: 'A4' };
  }

  // Solo A4 — A3 excluido del motor automático
  const a4 = [0, 0, 0, 0];
  for (const s of recent) {
    if (s.sector_a4 >= 1 && s.sector_a4 <= 4) a4[s.sector_a4 - 1]++;
  }

  const a4diff = Math.max(...a4) - Math.min(...a4);

  let score = 0;
  if (a4diff > 8)      score += 40;
  else if (a4diff > 5) score += 25;
  if (a4diff <= 2)     score -= 15;

  let reason;
  if (a4diff > 8)      reason = `Desbalance fuerte en A4 (Δ${a4diff})`;
  else if (a4diff > 5) reason = `Desbalance moderado en A4 (Δ${a4diff})`;
  else                 reason = `Distribución uniforme A4 (Δ${a4diff})`;

  return { score: Math.max(0, score), diff: a4diff, suggestedSystem: 'A4', reason };
}

// ─── C) Score Jacobo ──────────────────────────────────────────────────────────
// +30 distribución pareja · +20 sin dominantes · -25 números muy repetidos
function scoreJacoboSystem(spins) {
  const PRE_WIN = 20;
  if (spins.length < PRE_WIN) {
    return { score: 0, reason: 'Jacobo: datos insuficientes', uniqueNumbers: 0 };
  }

  const recent = spins.slice(-JACOBO_EVAL_WINDOW);
  const numCounts = {};
  for (const s of recent) numCounts[s.number] = (numCounts[s.number] || 0) + 1;

  const counts     = Object.values(numCounts);
  const maxCount   = Math.max(...counts);
  const uniqueNums = counts.length;
  const topNum     = Object.keys(numCounts).find(k => numCounts[k] === maxCount);

  let score = 0;
  // Spread
  if (uniqueNums >= 20)      score += 30;
  else if (uniqueNums >= 15) score += 15;
  // Dominance
  if (maxCount <= 3)      score += 20;
  else if (maxCount >= 6) score -= 25;
  // Opportunity bonus
  const opp = evaluateJacoboOpportunity(spins);
  if (opp.shouldActivate) score += 10;

  let reason;
  if (score >= 40)      reason = `Distribución muy pareja (${uniqueNums} únicos)`;
  else if (score >= 20) reason = `Distribución aceptable (${uniqueNums} únicos)`;
  else                  reason = `Concentración en ${topNum} (×${maxCount})`;

  return { score, uniqueNumbers: uniqueNums, maxCount, reason };
}

// ─── D) Score Vecinos (persistencia-aware) ────────────────────────────────────
function scoreVecinosSystem(spins) {
  if (spins.length < VECINOS_WIN) {
    return { score: 0, reason: 'Vecinos: datos insuficientes', zScore: 0 };
  }
  const zone = findHotZone(spins);
  if (!zone) return { score: 0, reason: 'Sin zona caliente (z≥1.63 sin anti-spike)', zScore: 0 };

  const z = zone.zScore;
  let base = 0;
  if (z >= 2.5)       base = 65;
  else if (z >= 2.0)  base = 55;
  else if (z >= 1.65) base = 42;
  else if (z >= 1.30) base = 28;

  const { score: pers } = computeZonePersistence(spins, zone.numbers);
  const persistBonus = Math.round(pers * 20);
  const score = Math.max(0, Math.min(99, base + persistBonus));
  const reason = `Zona z=${z.toFixed(1)} pers=${(pers * 100).toFixed(0)}% (${zone.hits}/${VECINOS_WIN} hits · centro ${zone.center})`;
  return { score, zScore: z, persistence: pers, hits: zone.hits, center: zone.center, reason };
}

// ─── Risk penalty: penalizar sistemas con ciclos perdidos ─────────────────────
function getRiskPenalty(state) {
  if (!state) return 0;
  // Bloqueado / cooldown = ciclo recientemente agotado
  if (state.status === 'BLOCKED' || state.status === 'COOLING') return -30;
  // 2+ abortados sin victorias
  if ((state.cyclesAborted || 0) >= 2 && (state.cyclesAborted || 0) > (state.cyclesCompleted || 0)) return -30;
  return 0;
}

// ─── Motor principal ──────────────────────────────────────────────────────────
export function computeBestSystem(spins, passTarget = 2, systemOverride = null, lockedSystem = null) {
  if (!spins || spins.length === 0) {
    return { system: null, confidence: 0, reason: 'Sin datos', scoreBreakdown: null, locked: false, lockReleased: false };
  }

  // ── Computar estados (para detección de lock) ──
  const mirrorStates = {
    color:  computeMirrorState(spins, 'color'),
    parity: computeMirrorState(spins, 'parity'),
    range:  computeMirrorState(spins, 'range'),
  };
  const jacoboState  = computeJacoboState(spins);
  const vecinosState = computeVecinosState(spins);
  // AUTO MODE: lock de SECTORES siempre evalúa A4, nunca A3
  const bettingState = computeBettingState(spins, 'A4', passTarget);

  // ── LOCK EXTERNO: sistema elegido previamente → mantener hasta fin de ciclo ──
  if (lockedSystem) {
    const { system: ls, mirrorMode: lm } = lockedSystem;
    let stillCycling = false;
    let lockReason   = '';

    if (ls === 'ESPEJO') {
      const mState = lm ? (mirrorStates[lm] || computeMirrorState(spins, lm)) : null;
      stillCycling = mState ? mState.status === 'ACTIVE' || mState.status === 'BLOCKED' : false;
      lockReason   = mState?.reason ?? '';
    } else if (ls === 'JACOBO') {
      stillCycling = jacoboState.isActive;
      lockReason   = jacoboState.currentStep ? `paso ${jacoboState.currentStep}` : '';
    } else if (ls === 'VECINOS') {
      stillCycling = vecinosState.isActive;
      lockReason   = vecinosState.isActive ? `paso ${vecinosState.step}/${vecinosState.totalSteps}` : '';
    } else if (ls === 'SECTORES') {
      stillCycling = bettingState?.active ?? false;
      lockReason   = bettingState?.active ? `bola ${bettingState.currentBall}/${bettingState.totalBalls}` : '';
    }

    if (stillCycling) {
      console.log(`[AUTO] Lock activo: ${ls}${lm ? `/${lm}` : ''} — ignorando otros sistemas`);
      return {
        system:    ls,
        mirrorMode: lm ?? null,
        confidence: 90,
        locked:    true,
        lockReleased: false,
        reason:    `🔒 ${ls}${lockReason ? ` — ${lockReason}` : ''}`,
        scoreBreakdown: null,
      };
    }

    console.log(`[AUTO] Ciclo de ${ls} terminado → lock liberado`);
  }

  // ── Lock: ciclo activo → no cambiar sistema ──
  const modeLabels = { color: 'Color', parity: 'Paridad', range: 'Rango' };

  for (const [mode, mState] of Object.entries(mirrorStates)) {
    if (mState.isActive) {
      return {
        system: 'ESPEJO', confidence: 85, locked: true, lockReleased: !!lockedSystem,
        mirrorMode: mode,
        reason: `Ciclo activo · ${modeLabels[mode]} paso ${mState.currentStep}/${mState.totalSteps}`,
        scoreBreakdown: null,
      };
    }
  }

  if (jacoboState.isActive) {
    return {
      system: 'JACOBO', confidence: jacoboState.confidence || 70, locked: true, lockReleased: !!lockedSystem,
      mirrorMode: null,
      reason: `Ciclo activo · paso ${jacoboState.currentStep ?? 1}`,
      scoreBreakdown: null,
    };
  }

  if (vecinosState.isActive) {
    return {
      system: 'VECINOS', confidence: vecinosState.confidence || 50, locked: true, lockReleased: !!lockedSystem,
      mirrorMode: null,
      reason: `Ciclo activo · paso ${vecinosState.step ?? 1}/${vecinosState.totalSteps ?? 5}`,
      scoreBreakdown: null,
    };
  }

  if (bettingState?.active) {
    return {
      system: 'SECTORES', confidence: 65, locked: true, lockReleased: !!lockedSystem,
      mirrorMode: null,
      reason: `Ciclo activo · bola ${bettingState.currentBall}/${bettingState.totalBalls}`,
      scoreBreakdown: null,
    };
  }

  // ── Sin ciclo activo: puntuar todos ──
  const mScore = scoreMirrorSystem(spins);
  const sScore = scoreSectorsSystem(spins);
  const jScore = scoreJacoboSystem(spins);
  const vScore = scoreVecinosSystem(spins);

  // Penalización por riesgo
  const bestMirrorState = Object.values(mirrorStates)
    .sort((a, b) =>
      ((b.cyclesCompleted || 0) + (b.cyclesAborted || 0)) -
      ((a.cyclesCompleted || 0) + (a.cyclesAborted || 0))
    )[0];

  const mAdj = mScore.score + getRiskPenalty(bestMirrorState);
  const sAdj = sScore.score + (
    (bettingState?.cyclesAborted >= 2 &&
     bettingState?.cyclesAborted > (bettingState?.cyclesCompleted || 0)) ? -30 : 0
  );
  const jAdj = jScore.score + getRiskPenalty(jacoboState);
  const vAdj = vScore.score + getRiskPenalty(vecinosState);

  const scoreBreakdown = {
    espejo:   Math.max(0, mAdj),
    sectores: Math.max(0, sAdj),
    jacobo:   Math.max(0, jAdj),
    vecinos:  Math.max(0, vAdj),
    _raw: { espejo: mScore.score, sectores: sScore.score, jacobo: jScore.score, vecinos: vScore.score },
  };

  // ── Candidatos con score >= umbral ──
  const candidates = [
    { system: 'ESPEJO',   score: mAdj, reason: mScore.reason, mirrorMode: mScore.mode },
    { system: 'SECTORES', score: sAdj, reason: sScore.reason, mirrorMode: null },
    { system: 'JACOBO',   score: jAdj, reason: jScore.reason, mirrorMode: null },
    { system: 'VECINOS',  score: vAdj, reason: vScore.reason, mirrorMode: null },
  ].filter(c => c.score >= MIN_SCORE_TO_BET);

  if (candidates.length === 0) {
    return {
      system: null, confidence: 0, locked: false, lockReleased: !!lockedSystem,
      mirrorMode: null,
      reason: 'Sin señal suficiente — no apostar',
      scoreBreakdown,
    };
  }

  // Ordenar: mayor score primero, desempate por prioridad
  candidates.sort((a, b) =>
    b.score - a.score || SYSTEM_PRIORITY[b.system] - SYSTEM_PRIORITY[a.system]
  );

  const best = candidates[0];
  return {
    system:     best.system,
    confidence: Math.min(99, best.score),
    locked:     false,
    lockReleased: !!lockedSystem,
    mirrorMode: best.mirrorMode,
    reason:     best.reason,
    scoreBreakdown,
  };
}
