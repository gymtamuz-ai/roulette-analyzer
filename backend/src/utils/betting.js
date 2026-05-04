const { getDataQuality } = require('./analysis');

// ─── Progression tables (must match frontend PROGRESSION_TABLES) ──────────────
//
// Fichas BASE por bola. Las fichas reales = base × 2^consecutiveWins.
//
// 2 PASES (9 bolas) — objetivo: 2 aciertos consecutivos
// 3 PASES (15 bolas) — objetivo: 3 aciertos consecutivos
//
// WIN  → consecutiveWins++; fichas × 2; si == winsRequired → completar, reiniciar bola 1
// LOSS → consecutiveWins = 0; avanzar bola (base, sin duplicar); si última → abortar

const PROGRESSION_TABLES = {
  2: [
    { ball:1, chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles'        },
    { ball:2, chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles'        },
    { ball:3, chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles'        },
    { ball:4, chips:12, betType:'calles', desc:'2 fch/calle × 6 calles'        },
    { ball:5, chips:12, betType:'calles', desc:'2 fch/calle × 6 calles'        },
    { ball:6, chips:18, betType:'plenos', desc:'1 pleno × 18 núms (2 sect.)'   },
    { ball:7, chips:24, betType:'mixto',  desc:'1 pleno + 1 calle × 2 sect.'   },
    { ball:8, chips:30, betType:'mixto',  desc:'1 pleno + 2 calles × 2 sect.'  },
    { ball:9, chips:42, betType:'mixto',  desc:'2 plenos + 1 calle × 2 sect.'  },
  ],
  3: [
    { ball:1,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:2,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:3,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:4,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:5,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:6,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:7,  chips:6,  betType:'calles', desc:'1 fch/calle × 6 calles' },
    { ball:8,  chips:12, betType:'calles', desc:'2 fch/calle × 6 calles' },
    { ball:9,  chips:12, betType:'calles', desc:'2 fch/calle × 6 calles' },
    { ball:10, chips:12, betType:'calles', desc:'2 fch/calle × 6 calles' },
    { ball:11, chips:12, betType:'calles', desc:'2 fch/calle × 6 calles' },
    { ball:12, chips:18, betType:'calles', desc:'3 fch/calle × 6 calles' },
    { ball:13, chips:18, betType:'calles', desc:'3 fch/calle × 6 calles' },
    { ball:14, chips:24, betType:'calles', desc:'4 fch/calle × 6 calles' },
    { ball:15, chips:24, betType:'calles', desc:'4 fch/calle × 6 calles' },
  ]
};

const PRE_ANALYSIS_WINDOW = 15;

// ─── Pre-analysis helpers ──────────────────────────────────────────────────────
function runStats(seq) {
  if (seq.length < 3) return null;
  const runs = [];
  let cur = seq[0], len = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === cur) len++;
    else { runs.push(len); cur = seq[i]; len = 1; }
  }
  runs.push(len);
  const avg = runs.reduce((a,b) => a+b, 0) / runs.length;
  const variance = runs.reduce((a,b) => a + (b-avg)**2, 0) / runs.length;
  const freq = {};
  for (const s of seq) freq[s] = (freq[s]||0)+1;
  const counts = Object.values(freq);
  const expectedPerSector = seq.length / 4;
  const freqVariance = counts.reduce((a,b) => a + (b-expectedPerSector)**2, 0) / counts.length;
  let changes = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i-1]) changes++;
  return { avg, variance, freqVariance, changeRate: changes/(seq.length-1), runs };
}

function preAnalysis(spins) {
  if (spins.length < PRE_ANALYSIS_WINDOW) return null;
  const recent = spins.slice(-PRE_ANALYSIS_WINDOW);
  const a3seq = recent.map(s => s.sector_a3).filter(Boolean);
  const a4seq = recent.map(s => s.sector_a4).filter(Boolean);
  const a3 = runStats(a3seq);
  const a4 = runStats(a4seq);
  if (!a3 || !a4) return null;

  const scoreA3 = -(a3.variance * 0.5 + a3.freqVariance * 0.35 + a3.avg * 0.15);
  const scoreA4 = -(a4.variance * 0.5 + a4.freqVariance * 0.35 + a4.avg * 0.15);
  const selected = scoreA3 >= scoreA4 ? 'A3' : 'A4';
  const diff = Math.abs(scoreA3 - scoreA4);
  const isConclusive = diff > 0.08;

  const w = selected === 'A3' ? a3 : a4;
  const l = selected === 'A3' ? a4 : a3;
  const reasons = [];
  if (w.variance < l.variance) reasons.push(`varianza ${w.variance.toFixed(2)} < ${l.variance.toFixed(2)}`);
  if (w.avg <= l.avg) reasons.push(`racha avg ${w.avg.toFixed(1)} ≤ ${l.avg.toFixed(1)}`);
  if (w.freqVariance < l.freqVariance) reasons.push('distribución más balanceada');

  return {
    selected, isConclusive,
    confidence: Math.min(99, Math.round(diff / 0.4 * 100)),
    a3, a4,
    scores: { A3: scoreA3, A4: scoreA4 },
    reason: reasons.join(' · ') || `${selected} marginalmente preferido`
  };
}

// ─── Last two distinct sectors ─────────────────────────────────────────────────
function getLastTwoDistinct(seq) {
  const found = [];
  for (let i = seq.length - 1; i >= 0 && found.length < 2; i--) {
    if (found.length === 0 || found[found.length-1] !== seq[i]) found.push(seq[i]);
  }
  return found.length === 2 ? [found[1], found[0]] : null;
}

// ─── Unified state machine ────────────────────────────────────────────────────
//
//   WIN  → consecutiveWins++
//          fichas_siguiente = base × 2^consecutiveWins
//          SI consecutiveWins == winsRequired → completar, reiniciar bola 1
//
//   LOSS → consecutiveWins = 0
//          avanzar bola (base sin duplicar)
//          SI última bola → abortar, reiniciar bola 1
//
function runCycle(spins, key, winsRequired) {
  const TABLE = PROGRESSION_TABLES[winsRequired === 2 ? 2 : 3];
  let ballIdx = 0, consecutiveWins = 0;
  let cyclesCompleted = 0, cyclesAborted = 0;
  let currentCycleInvested = 0, currentCycleHistory = [];

  // Sectores iniciales (se recalculan tras cada tirada, ver final del bucle)
  let targetSectors = getLastTwoDistinct(
    spins.slice(0, PRE_ANALYSIS_WINDOW).map(s => s[key]).filter(Boolean)
  );

  for (let i = 0; i < spins.length; i++) {
    const sectorVal = spins[i][key];

    // Sin sectores aún → actualizar y esperar siguiente tirada
    if (!targetSectors) {
      targetSectors = getLastTwoDistinct(spins.slice(0, i+1).map(s => s[key]).filter(Boolean));
      continue;
    }

    const baseState = TABLE[ballIdx];
    if (!baseState) {
      targetSectors = getLastTwoDistinct(spins.slice(0, i+1).map(s => s[key]).filter(Boolean));
      continue;
    }

    // Fichas reales = base × 2^aciertos_consecutivos
    const currentChips = baseState.chips * Math.pow(2, consecutiveWins);
    const isWin = sectorVal != null && sectorVal !== undefined && targetSectors.includes(sectorVal);

    currentCycleInvested += currentChips;
    currentCycleHistory.push({
      ball: baseState.ball, chips: currentChips,
      baseChips: baseState.chips, consecutiveWins,
      result: isWin ? 'win' : 'loss'
    });

    if (isWin) {
      consecutiveWins++;
      if (consecutiveWins >= winsRequired) {
        // Objetivo logrado → completar ciclo, reiniciar
        cyclesCompleted++;
        ballIdx = 0;
        consecutiveWins = 0;
        currentCycleInvested = 0;
        currentCycleHistory = [];
      }
      // else: permanecer en la misma bola con apuesta × 2
    } else {
      // Pérdida → resetear aciertos, avanzar bola
      consecutiveWins = 0;
      if (ballIdx >= TABLE.length - 1) {
        cyclesAborted++;
        ballIdx = 0;
        currentCycleInvested = 0;
        currentCycleHistory = [];
      } else {
        ballIdx++;
      }
    }

    // ─── CRÍTICO: recalcular sectores tras CADA tirada ────────────────────────
    // Los últimos 2 sectores distintos cambian con cada nueva bola registrada.
    // NO cachear — siempre derivar del historial completo hasta esta tirada.
    targetSectors = getLastTwoDistinct(spins.slice(0, i+1).map(s => s[key]).filter(Boolean));
  }

  return {
    ballIdx, consecutiveWins,
    cyclesCompleted, cyclesAborted,
    currentCycleInvested,
    currentCycleHistory: currentCycleHistory.slice(-15),
    targetSectors
  };
}

// ─── Full state machine (deterministic replay) ─────────────────────────────────
function computeBettingState(spins, systemTypeOverride = null, passTarget = 2) {
  if (spins.length < PRE_ANALYSIS_WINDOW) {
    return {
      active: false,
      reason: `Mínimo ${PRE_ANALYSIS_WINDOW} tiradas (faltan ${PRE_ANALYSIS_WINDOW - spins.length})`,
      spinsNeeded: PRE_ANALYSIS_WINDOW - spins.length,
      dataQuality: getDataQuality(spins.length)
    };
  }

  const analysis     = preAnalysis(spins);
  const system       = systemTypeOverride || analysis?.selected || 'A3';
  const key          = system === 'A3' ? 'sector_a3' : 'sector_a4';
  const winsRequired = passTarget === 3 ? 3 : 2;

  const c     = runCycle(spins, key, winsRequired);
  const TABLE = PROGRESSION_TABLES[winsRequired === 2 ? 2 : 3];
  const cur   = TABLE[c.ballIdx];
  const isLast = c.ballIdx === TABLE.length - 1;

  // Fichas reales de la próxima apuesta
  const currentChips = cur.chips * Math.pow(2, c.consecutiveWins);
  const winsNeeded   = winsRequired - c.consecutiveWins;

  const nextChips = currentChips * 2;
  const onWin = winsNeeded <= 1
    ? `✅ COMPLETA CICLO → reiniciar bola 1`
    : `×2 → ${nextChips} fichas (faltan ${winsNeeded - 1} más)`;

  return {
    active: true,
    systemType: system, autoSystem: analysis?.selected, analysis,
    passTarget: winsRequired === 2 ? 2 : 3,
    targetSectors: c.targetSectors,
    currentBall: cur.ball, totalBalls: TABLE.length,
    currentChips, baseChips: cur.chips,
    winMultiplier: Math.pow(2, c.consecutiveWins),
    consecutiveWins: c.consecutiveWins, winsNeeded, winsRequired,
    betType: cur.betType, betDesc: cur.desc,
    onWin,
    onLoss: isLast ? 'stop' : `bola ${cur.ball + 1}`,
    isLastBall: isLast,
    cyclesCompleted: c.cyclesCompleted, cyclesAborted: c.cyclesAborted,
    currentCycleInvested: c.currentCycleInvested,
    currentCycleHistory:  c.currentCycleHistory,
    dataQuality: getDataQuality(spins.length)
  };
}

/**
 * Calculates the bet result for the current spin.
 * bettingState.currentChips already includes the ×2^consecutiveWins multiplier.
 */
function calculateBetResult(bettingState, newSpinSectorA3, newSpinSectorA4) {
  if (!bettingState || !bettingState.active || !bettingState.targetSectors) {
    return null;
  }

  const sectorValue = bettingState.systemType === 'A3' ? newSpinSectorA3 : newSpinSectorA4;
  const chips = bettingState.currentChips;

  if (sectorValue === null || sectorValue === undefined) {
    return {
      result: 'loss',
      payout: 0,
      profit: -chips,
      chips,
      multiplier: bettingState.winMultiplier || 1,
      systemType: bettingState.systemType,
      betSectors: bettingState.targetSectors
    };
  }

  const isWin = bettingState.targetSectors.includes(sectorValue);
  return {
    result: isWin ? 'win' : 'loss',
    payout: isWin ? chips * 2 : 0,
    profit: isWin ? chips : -chips,
    chips,
    multiplier: bettingState.winMultiplier || 1,
    systemType: bettingState.systemType,
    betSectors: bettingState.targetSectors
  };
}

module.exports = {
  computeBettingState,
  calculateBetResult,
  getLastTwoDistinct,
  PROGRESSION_TABLES,
  PRE_ANALYSIS_WINDOW
};
