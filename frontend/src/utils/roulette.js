// ═══════════════════════════════════════════════════════════════════════════════
// ROULETTE ANALYZER — Core utilities
// ═══════════════════════════════════════════════════════════════════════════════

export const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

// Physical European wheel order (used for cylinder visualization & cylinder sectors)
export const WHEEL_ORDER = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,
  24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

// ─── A3 / A4 sector definitions ───────────────────────────────────────────────
export const A3_SECTORS = {
  1: [1,2,3,13,14,15,25,26,27],
  2: [4,5,6,16,17,18,28,29,30],
  3: [7,8,9,19,20,21,31,32,33],
  4: [10,11,12,22,23,24,34,35,36]
};
export const A4_SECTORS = {
  1:[1,2,3,4,5,6,7,8,9],
  2:[10,11,12,13,14,15,16,17,18],
  3:[19,20,21,22,23,24,25,26,27],
  4:[28,29,30,31,32,33,34,35,36]
};
const A3_REVERSE = {};
for (const [s, nums] of Object.entries(A3_SECTORS)) for (const n of nums) A3_REVERSE[n] = parseInt(s);

// ─── Cylinder sectors (physical positions on wheel) ───────────────────────────
// S0: 0 ± 7 neighbors  |  S5: 5 ± 7 neighbors  |  Orphans: rest
function buildCylinderSectors() {
  const N = WHEEL_ORDER.length;
  const idx0 = WHEEL_ORDER.indexOf(0);  // 0
  const idx5 = WHEEL_ORDER.indexOf(5);  // 19

  const s0 = new Set(), s5 = new Set();
  for (let i = -7; i <= 7; i++) {
    s0.add(WHEEL_ORDER[(idx0 + i + N) % N]);
    s5.add(WHEEL_ORDER[(idx5 + i + N) % N]);
  }
  const orphans = new Set(WHEEL_ORDER.filter(n => !s0.has(n) && !s5.has(n)));
  return {
    s0: [...s0],   // 15 numbers around 0
    s5: [...s5],   // 15 numbers around 5
    orphans: [...orphans]  // 7 remaining
  };
}
export const CYLINDER_SECTORS = buildCylinderSectors();

const CYL_REVERSE = {};
for (const n of CYLINDER_SECTORS.s0) CYL_REVERSE[n] = 'S0';
for (const n of CYLINDER_SECTORS.s5) CYL_REVERSE[n] = 'S5';
for (const n of CYLINDER_SECTORS.orphans) CYL_REVERSE[n] = 'ORF';

export function getCylinderSector(n) { return CYL_REVERSE[n] ?? null; }

// ─── Number classification ────────────────────────────────────────────────────
export function classifyNumber(n) {
  if (n === 0) return {
    number:0, color:'green', parity:'zero', dozen:null, col:null,
    sector_a3:null, sector_a4:null, cylinder_sector:'S0',
    half: null
  };
  return {
    number: n,
    color: RED_NUMBERS.has(n) ? 'red' : 'black',
    parity: n % 2 === 0 ? 'even' : 'odd',
    dozen: n <= 12 ? 1 : n <= 24 ? 2 : 3,
    col: ((n - 1) % 3) + 1,
    sector_a3: A3_REVERSE[n] ?? null,
    sector_a4: n <= 9 ? 1 : n <= 18 ? 2 : n <= 27 ? 3 : 4,
    cylinder_sector: CYL_REVERSE[n] ?? null,
    half: n <= 18 ? 'low' : 'high'
  };
}

export function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function getSectorNumbers(systemType, sectorNum) {
  return (systemType === 'A3' ? A3_SECTORS : A4_SECTORS)[sectorNum] || [];
}
export function getSectorStreets(systemType, sectorNum) {
  const nums = getSectorNumbers(systemType, sectorNum);
  return [nums.slice(0,3), nums.slice(3,6), nums.slice(6,9)];
}

// ─── Frequencies ──────────────────────────────────────────────────────────────
export function calculateFrequencies(spins) {
  const freq = {};
  for (let i = 0; i <= 36; i++) freq[i] = 0;
  for (const s of spins) freq[s.number] = (freq[s.number] || 0) + 1;
  return freq;
}

// ─── Extended delays (all chance categories) ──────────────────────────────────
function lastIdx(spins, pred) {
  for (let i = spins.length - 1; i >= 0; i--) if (pred(spins[i])) return i;
  return -1;
}
function delay(spins, pred) {
  const idx = lastIdx(spins, pred);
  return idx === -1 ? spins.length : spins.length - 1 - idx;
}

export function calculateAllDelays(spins) {
  if (!spins.length) return null;
  return {
    // Simple number delays
    numbers: (() => {
      const d = {};
      const lastSeen = {};
      spins.forEach((s, i) => { lastSeen[s.number] = i; });
      for (let n = 0; n <= 36; n++) {
        d[n] = lastSeen[n] === undefined ? spins.length : spins.length - 1 - lastSeen[n];
      }
      return d;
    })(),
    // Colors
    color: {
      red:   delay(spins, s => s.color === 'red'),
      black: delay(spins, s => s.color === 'black'),
      green: delay(spins, s => s.color === 'green'),
    },
    // Parity
    parity: {
      even: delay(spins, s => s.parity === 'even'),
      odd:  delay(spins, s => s.parity === 'odd'),
    },
    // High / Low
    half: {
      low:  delay(spins, s => s.number >= 1 && s.number <= 18),
      high: delay(spins, s => s.number >= 19 && s.number <= 36),
    },
    // Dozens
    dozen: {
      1: delay(spins, s => s.dozen === 1),
      2: delay(spins, s => s.dozen === 2),
      3: delay(spins, s => s.dozen === 3),
    },
    // Columns
    col: {
      1: delay(spins, s => s.col === 1),
      2: delay(spins, s => s.col === 2),
      3: delay(spins, s => s.col === 3),
    },
    // A3 sectors
    sectorA3: {
      1: delay(spins, s => s.sector_a3 === 1),
      2: delay(spins, s => s.sector_a3 === 2),
      3: delay(spins, s => s.sector_a3 === 3),
      4: delay(spins, s => s.sector_a3 === 4),
    },
    // A4 sectors
    sectorA4: {
      1: delay(spins, s => s.sector_a4 === 1),
      2: delay(spins, s => s.sector_a4 === 2),
      3: delay(spins, s => s.sector_a4 === 3),
      4: delay(spins, s => s.sector_a4 === 4),
    },
    // Cylinder sectors
    cylinder: {
      S0:  delay(spins, s => s.cylinder_sector === 'S0'),
      S5:  delay(spins, s => s.cylinder_sector === 'S5'),
      ORF: delay(spins, s => s.cylinder_sector === 'ORF'),
    }
  };
}

// Legacy aliases used by existing components
export function calculateDelays(spins) {
  return calculateAllDelays(spins)?.numbers || {};
}
export function calculateSectorDelays(spins, type) {
  const all = calculateAllDelays(spins);
  return type === 'A3' ? (all?.sectorA3 || {}) : (all?.sectorA4 || {});
}

// ─── Trends ───────────────────────────────────────────────────────────────────
export function calculateTrends(spins, windows = [10, 25, 50]) {
  const countBy = (arr, key) => arr.reduce((acc, item) => {
    const v = item[key];
    if (v !== null && v !== undefined) acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  return windows.reduce((acc, w) => {
    const recent = spins.slice(-w);
    acc[w] = {
      total: recent.length,
      color: countBy(recent, 'color'),
      parity: countBy(recent, 'parity'),
      dozen: countBy(recent, 'dozen'),
      sectorA3: countBy(recent, 'sector_a3'),
      sectorA4: countBy(recent, 'sector_a4'),
      cylinder: countBy(recent, 'cylinder_sector')
    };
    return acc;
  }, {});
}

// ─── Data quality ─────────────────────────────────────────────────────────────
export function getDataQuality(n) {
  if (n < 300)  return { label:'MUESTRA INSUFICIENTE', emoji:'❌', level:0, tw:'text-red-400' };
  if (n < 1000) return { label:'DATOS EN FORMACIÓN',   emoji:'⚠️', level:1, tw:'text-yellow-400' };
  if (n < 5000) return { label:'MUESTRA RELEVANTE',    emoji:'✅', level:2, tw:'text-green-400' };
  return         { label:'SESGO DETECTABLE',            emoji:'🔥', level:3, tw:'text-orange-400' };
}

// ─── Pre-analysis (15 spins) ──────────────────────────────────────────────────
export const PRE_ANALYSIS_WINDOW = 15;

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

export function preAnalysis(spins) {
  if (spins.length < PRE_ANALYSIS_WINDOW) return null;
  const recent = spins.slice(-PRE_ANALYSIS_WINDOW);
  const a3seq = recent.map(s => s.sector_a3).filter(Boolean);
  const a4seq = recent.map(s => s.sector_a4).filter(Boolean);
  const a3 = runStats(a3seq);
  const a4 = runStats(a4seq);
  if (!a3 || !a4) return null;

  // Lower variance + lower freqVariance = more stable = better
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

// ─── Progression tables ───────────────────────────────────────────────────────
//
// SISTEMA 2 PASES (9 bolas)
//   WIN  → siempre reiniciar a bola 1
//   LOSS → avanzar a siguiente bola
//   LOSS en bola 9 → stop ciclo
//
//   Fase 1 (bolas 1–3): 1 fch/calle × 6 calles =  6 fichas
//   Fase 2 (bolas 4–5): 2 fch/calle × 6 calles = 12 fichas
//   Fase 3 (bolas 6–9): estructura mixta creciente
//
// SISTEMA 3 PASES (15 bolas)
//   WIN  → consecutiveWins++; fichas ×2; al llegar a 3 → completar, reiniciar bola 1
//   LOSS → avanzar bola, resetear consecutiveWins a 0 (NO reiniciar a bola 1)
//   LOSS en bola 15 → stop ciclo
//
//   Fase 1 (bolas  1– 7): 1 fch/calle × 6 calles =  6 fichas base
//   Fase 2 (bolas  8–11): 2 fch/calle × 6 calles = 12 fichas base
//   Fase 3 (bolas 12–13): 3 fch/calle × 6 calles = 18 fichas base
//   Fase 4 (bolas 14–15): 4 fch/calle × 6 calles = 24 fichas base
//   (fichas reales = base × 2^consecutiveWins)

export const PROGRESSION_TABLES = {
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

// ─── Last two distinct sectors ────────────────────────────────────────────────
function getLastTwoDistinct(seq) {
  const found = [];
  for (let i = seq.length - 1; i >= 0 && found.length < 2; i--) {
    if (found.length === 0 || found[found.length-1] !== seq[i]) found.push(seq[i]);
  }
  return found.length === 2 ? [found[1], found[0]] : null;
}

// ─── Unified state machine ────────────────────────────────────────────────────
//
// Ambos sistemas (2 pases / 3 pases) comparten la misma lógica:
//
//   WIN  → consecutiveWins++
//          fichas_siguiente = base × 2^consecutiveWins
//          SI consecutiveWins == winsRequired → completar ciclo, reiniciar bola 1
//
//   LOSS → consecutiveWins = 0
//          avanzar bola (usar base de la nueva bola, sin duplicar)
//          SI última bola → abortar ciclo, reiniciar bola 1
//
// El duplicado aplica SIEMPRE sobre la apuesta BASE del paso actual:
//   fichas_reales = TABLE[ballIdx].chips × 2^consecutiveWins
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
      // Actualizar sectores aunque no haya estado de tabla
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
        // Última bola perdida → abortar ciclo
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

// ─── Public: full state machine with pre-analysis ─────────────────────────────
export function computeStateMachine(spins, systemTypeOverride = null, passTarget = 2) {
  if (spins.length < PRE_ANALYSIS_WINDOW) {
    return {
      active: false,
      reason: `Mínimo ${PRE_ANALYSIS_WINDOW} tiradas (faltan ${PRE_ANALYSIS_WINDOW - spins.length})`,
      spinsNeeded: PRE_ANALYSIS_WINDOW - spins.length,
      dataQuality: getDataQuality(spins.length)
    };
  }

  const analysis = preAnalysis(spins);
  const system   = systemTypeOverride || analysis?.selected || 'A3';
  const key      = system === 'A3' ? 'sector_a3' : 'sector_a4';

  const winsRequired = passTarget === 3 ? 3 : 2;
  const c     = runCycle(spins, key, winsRequired);
  const TABLE = PROGRESSION_TABLES[winsRequired === 2 ? 2 : 3];
  const cur   = TABLE[c.ballIdx];
  const isLast = c.ballIdx === TABLE.length - 1;

  // Fichas reales de la próxima apuesta
  const currentChips = cur.chips * Math.pow(2, c.consecutiveWins);
  const winsNeeded   = winsRequired - c.consecutiveWins;

  // Texto "si gana"
  const nextChips    = currentChips * 2;
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

// Legacy alias
export function computeBettingState(spins, systemType = null, passTarget = 2) {
  return computeStateMachine(spins, systemType, passTarget);
}

// ─── Bias metrics ─────────────────────────────────────────────────────────────
export function calculateBiasMetrics(spins) {
  const n = spins.length;
  if (n === 0) return { n: 0, quality: getDataQuality(0) };
  const freq = calculateFrequencies(spins);
  const expected = n / 37;
  const deviations = {};
  let chiSquare = 0;
  for (let num = 0; num <= 36; num++) {
    deviations[num] = (freq[num] - expected) / expected * 100;
    chiSquare += (freq[num] - expected) ** 2 / expected;
  }
  const sorted = Object.entries(freq).sort(([,a],[,b]) => b-a);
  return {
    n, expected, freq, deviations, chiSquare,
    hotNumbers: sorted.slice(0,7).map(([num,f]) => ({ number:parseInt(num), frequency:f, deviation:deviations[num] })),
    coldNumbers: sorted.slice(-7).reverse().map(([num,f]) => ({ number:parseInt(num), frequency:f, deviation:deviations[num] })),
    quality: getDataQuality(n)
  };
}

// ─── Maximum historical delays ────────────────────────────────────────────────
// Returns same shape as calculateAllDelays but with the peak delay ever reached
// across the full session (includes the current ongoing streak).
export function calculateMaxDelays(spins) {
  if (!spins.length) return null;

  // Generic helper: one pass through spins, finds longest dry-streak for a predicate
  function maxD(pred) {
    let peak = 0, cur = 0;
    for (const s of spins) {
      if (pred(s)) { peak = Math.max(peak, cur); cur = 0; }
      else cur++;
    }
    return Math.max(peak, cur); // include the still-open streak at session end
  }

  const numbers = {};
  for (let n = 0; n <= 36; n++) numbers[n] = maxD(s => s.number === n);

  return {
    numbers,
    color:    { red:   maxD(s => s.color === 'red'),
                black: maxD(s => s.color === 'black'),
                green: maxD(s => s.color === 'green') },
    parity:   { even:  maxD(s => s.parity === 'even'),
                odd:   maxD(s => s.parity === 'odd') },
    half:     { low:   maxD(s => s.number >= 1 && s.number <= 18),
                high:  maxD(s => s.number >= 19) },
    dozen:    { 1: maxD(s => s.dozen === 1), 2: maxD(s => s.dozen === 2), 3: maxD(s => s.dozen === 3) },
    col:      { 1: maxD(s => s.col === 1),   2: maxD(s => s.col === 2),   3: maxD(s => s.col === 3) },
    sectorA3: { 1: maxD(s => s.sector_a3 === 1), 2: maxD(s => s.sector_a3 === 2),
                3: maxD(s => s.sector_a3 === 3), 4: maxD(s => s.sector_a3 === 4) },
    sectorA4: { 1: maxD(s => s.sector_a4 === 1), 2: maxD(s => s.sector_a4 === 2),
                3: maxD(s => s.sector_a4 === 3), 4: maxD(s => s.sector_a4 === 4) },
    cylinder: { S0:  maxD(s => s.cylinder_sector === 'S0'),
                S5:  maxD(s => s.cylinder_sector === 'S5'),
                ORF: maxD(s => s.cylinder_sector === 'ORF') },
  };
}

// Random spin for simulation
export function randomSpin() { return Math.floor(Math.random() * 37); }
