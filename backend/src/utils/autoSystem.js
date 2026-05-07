// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR DE DECISIÓN AUTOMÁTICO — Backend (CommonJS)
// ═══════════════════════════════════════════════════════════════════════════════

const { computeMirrorState }                             = require('./mirror');
const { computeJacoboState, evaluateJacoboOpportunity }  = require('./jacobo');
const { computeBettingState }                            = require('./betting');
const { computeVecinosState, findHotZone, ANALYSIS_WINDOW: VECINOS_WIN } = require('./vecinos');
const { computeZonePersistence } = require('./vecinosAnalytics');

const MIN_SCORE_TO_BET   = 30;
const SECTOR_EVAL_WINDOW = 30;
const JACOBO_EVAL_WINDOW = 30;
const MIRROR_WIN         = 10;
const SYSTEM_PRIORITY    = { ESPEJO: 4, VECINOS: 3, SECTORES: 2, JACOBO: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
  return Math.max(0, streak - 1);
}

function isNoisyForMode(spins, mode) {
  const vals = spins.slice(-MIRROR_WIN).map(s => valueForMode(s, mode)).filter(v => v !== null);
  if (vals.length < 4) return false;
  let alt = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1]) alt++;
  return (alt / (vals.length - 1)) > 0.70;
}

// ─── A) Score Espejo ──────────────────────────────────────────────────────────
function scoreMirrorSystem(spins) {
  if (spins.length < MIRROR_WIN) return { score: 0, mode: null, streak: 0 };
  let best = { score: -Infinity, mode: null, streak: 0 };
  for (const mode of ['color', 'parity', 'range']) {
    const streak = computeStreakForMode(spins, mode);
    const noisy  = isNoisyForMode(spins, mode);
    let score = 0;
    if (streak >= 4)       score += 40;
    else if (streak === 3) score += 25;
    if (noisy)             score -= 20;
    if (score > best.score) best = { score, mode, streak };
  }
  return { score: Math.max(0, best.score), mode: best.mode, streak: best.streak };
}

// ─── B) Score Sectores A4 ────────────────────────────────────────────────────
// AUTO MODE usa exclusivamente A4. A3 queda fuera del motor automático.
function scoreSectorsSystem(spins) {
  const recent = spins.slice(-SECTOR_EVAL_WINDOW).filter(s => s.number !== 0);
  if (recent.length < 10) return { score: 0, diff: 0, suggestedSystem: 'A4' };
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
  return { score: Math.max(0, score), diff: a4diff, suggestedSystem: 'A4' };
}

// ─── C) Score Jacobo ──────────────────────────────────────────────────────────
function scoreJacoboSystem(spins) {
  if (spins.length < 20) return { score: 0 };
  const recent = spins.slice(-JACOBO_EVAL_WINDOW);
  const numCounts = {};
  for (const s of recent) numCounts[s.number] = (numCounts[s.number] || 0) + 1;
  const counts     = Object.values(numCounts);
  const maxCount   = Math.max(...counts);
  const uniqueNums = counts.length;
  let score = 0;
  if (uniqueNums >= 20)      score += 30;
  else if (uniqueNums >= 15) score += 15;
  if (maxCount <= 3)      score += 20;
  else if (maxCount >= 6) score -= 25;
  const opp = evaluateJacoboOpportunity(spins);
  if (opp.shouldActivate) score += 10;
  return { score };
}

// ─── D) Score Vecinos (persistencia-aware) ────────────────────────────────────
// Score considera tanto z-score como persistencia de la zona.
// Persistencia alta multiplica la confianza ya que señales persistentes
// son exponencialmente menos probables de ser ruido aleatorio.
function scoreVecinosSystem(spins) {
  if (spins.length < VECINOS_WIN) return { score: 0, zScore: 0, reason: 'Vecinos: datos insuficientes' };
  const zone = findHotZone(spins);
  if (!zone) return { score: 0, zScore: 0, reason: 'Sin zona caliente (z≥1.63 sin anti-spike)' };

  const z = zone.zScore;
  // Base score por z-score
  let base = 0;
  if (z >= 2.5)       base = 65;
  else if (z >= 2.0)  base = 55;
  else if (z >= 1.65) base = 42;
  else if (z >= 1.30) base = 28;

  // Bonus por persistencia (0-20 pts): zona consistentemente caliente = mucho más probable sesgo real
  const { score: pers } = computeZonePersistence(spins, zone.numbers);
  const persistBonus = Math.round(pers * 20);

  const score = Math.max(0, Math.min(99, base + persistBonus));
  const reason = `Zona z=${z.toFixed(1)} pers=${(pers * 100).toFixed(0)}% (${zone.hits}/${VECINOS_WIN} hits · centro ${zone.center})`;
  return { score, zScore: z, persistence: pers, center: zone.center, reason };
}

// ─── Risk penalty ─────────────────────────────────────────────────────────────
function getRiskPenalty(state) {
  if (!state) return 0;
  if (state.status === 'BLOCKED' || state.status === 'COOLING') return -30;
  if ((state.cyclesAborted || 0) >= 2 && (state.cyclesAborted || 0) > (state.cyclesCompleted || 0)) return -30;
  return 0;
}

// ─── Motor principal ──────────────────────────────────────────────────────────
function computeBestSystem(spins, passTarget = 2, systemOverride = null, lockedSystem = null) {
  if (!spins || spins.length === 0) return { system: null, mirrorMode: null };

  // Computar estados
  const mirrorStates = {
    color:  computeMirrorState(spins, 'color'),
    parity: computeMirrorState(spins, 'parity'),
    range:  computeMirrorState(spins, 'range'),
  };
  const jacoboState  = computeJacoboState(spins);
  const vecinosState = computeVecinosState(spins);
  // AUTO MODE: lock de SECTORES siempre evalúa A4, nunca A3
  const bettingState = computeBettingState(spins, 'A4', parseInt(passTarget));

  // ── LOCK EXTERNO: sistema elegido previamente → mantener hasta fin de ciclo ──
  if (lockedSystem) {
    const { system: ls, mirrorMode: lm } = lockedSystem;
    let stillCycling = false;

    if (ls === 'ESPEJO') {
      const mState = lm ? (mirrorStates[lm] || computeMirrorState(spins, lm)) : null;
      stillCycling = mState ? mState.status === 'ACTIVE' || mState.status === 'BLOCKED' : false;
    } else if (ls === 'JACOBO') {
      stillCycling = jacoboState.isActive;
    } else if (ls === 'VECINOS') {
      stillCycling = vecinosState.isActive;
    } else if (ls === 'SECTORES') {
      stillCycling = bettingState?.active ?? false;
    }

    if (stillCycling) {
      return { system: ls, mirrorMode: lm ?? null };
    }
  }

  // Lock: ciclo activo en progreso → mantener sistema
  for (const [mode, mState] of Object.entries(mirrorStates)) {
    if (mState.isActive) return { system: 'ESPEJO',   mirrorMode: mode };
  }
  if (jacoboState.isActive)  return { system: 'JACOBO',   mirrorMode: null };
  if (vecinosState.isActive) return { system: 'VECINOS',  mirrorMode: null };
  if (bettingState?.active)  return { system: 'SECTORES', mirrorMode: null };

  // Scoring
  const mScore = scoreMirrorSystem(spins);
  const sScore = scoreSectorsSystem(spins);
  const jScore = scoreJacoboSystem(spins);
  const vScore = scoreVecinosSystem(spins);

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

  const candidates = [
    { system: 'ESPEJO',   score: mAdj, mirrorMode: mScore.mode },
    { system: 'SECTORES', score: sAdj, mirrorMode: null },
    { system: 'JACOBO',   score: jAdj, mirrorMode: null },
    { system: 'VECINOS',  score: vAdj, mirrorMode: null },
  ].filter(c => c.score >= MIN_SCORE_TO_BET);

  if (candidates.length === 0) return { system: null, mirrorMode: null };

  candidates.sort((a, b) =>
    b.score - a.score || SYSTEM_PRIORITY[b.system] - SYSTEM_PRIORITY[a.system]
  );

  return { system: candidates[0].system, mirrorMode: candidates[0].mirrorMode };
}

module.exports = { computeBestSystem };
