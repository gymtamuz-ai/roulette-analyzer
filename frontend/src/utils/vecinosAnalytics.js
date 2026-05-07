// ═══════════════════════════════════════════════════════════════════════════════
// VECINOS — Módulo de análisis cuantitativo
//
// Provee funciones puras y sin side-effects para evaluar la calidad estadística
// de una zona caliente detectada en el cilindro.
//
// NOTA MATEMÁTICA: Edge real SÓLO existe si la ruleta tiene sesgo físico.
// Estas métricas detectan anomalías estadísticas. La rentabilidad depende
// de que esas anomalías sean causadas por el mecanismo, no por ruido aleatorio.
// ═══════════════════════════════════════════════════════════════════════════════

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];
const N = 37;

export const WHEEL_INDEX = {};
for (let i = 0; i < N; i++) WHEEL_INDEX[WHEEL_ORDER[i]] = i;

// Zona de 9 números: 9/37 ≈ 0.2432
const ZONE_COVERAGE = 9 / N;

// ─── Persistencia de zona ─────────────────────────────────────────────────────
// Desliza sub-ventanas sobre el historial y mide en cuántas la zona supera
// el umbral de exceso (30% sobre lo esperado). Una zona persistentemente
// caliente es mucho más improbable de ser ruido que un pico aislado.
//
// p(ruido en una ventana) ≈ 5%
// p(ruido en 3 ventanas consecutivas) ≈ 0.5%
// p(ruido en 5 ventanas consecutivas) ≈ 0.03%
export function computeZonePersistence(spins, zoneNumbers, {
  windowSize = 20,
  step       = 10,
  maxWindows = 6,
  threshold  = 1.30,   // zona caliente = hits ≥ 130% de lo esperado
} = {}) {
  if (spins.length < windowSize) return { score: 0, hotWindows: 0, totalWindows: 0 };

  const zoneSet = new Set(zoneNumbers);
  const expected = windowSize * ZONE_COVERAGE;
  let hotWindows = 0, totalWindows = 0;

  for (let end = spins.length; end >= windowSize && totalWindows < maxWindows; end -= step) {
    const slice = spins.slice(end - windowSize, end);
    const hits  = slice.filter(s => zoneSet.has(s.number)).length;
    if (hits >= expected * threshold) hotWindows++;
    totalWindows++;
  }

  return {
    score:       totalWindows > 0 ? hotWindows / totalWindows : 0,
    hotWindows,
    totalWindows,
  };
}

// ─── Estabilidad de zona ──────────────────────────────────────────────────────
// Mide si la zona más caliente en cada sub-ventana se mantiene en la misma
// región del cilindro. Zonas estables = más probable sesgo físico, no ruido.
export function computeZoneStability(spins, primaryCenterNum, {
  windowSize = 20,
  step       = 10,
  maxWindows = 6,
  maxDrift   = 4,      // posiciones de cilindro de tolerancia
} = {}) {
  if (spins.length < windowSize * 2) return { score: 0, stableWindows: 0, totalWindows: 0 };

  const primaryPos = WHEEL_INDEX[primaryCenterNum];
  if (primaryPos === undefined) return { score: 0, stableWindows: 0, totalWindows: 0 };

  let stableWindows = 0, totalWindows = 0;

  for (let end = spins.length; end >= windowSize && totalWindows < maxWindows; end -= step) {
    const slice = spins.slice(end - windowSize, end);
    const { bestCenter } = _findBestCenterRaw(slice);

    if (bestCenter !== -1) {
      const dist = Math.min(
        Math.abs(bestCenter - primaryPos),
        N - Math.abs(bestCenter - primaryPos),
      );
      if (dist <= maxDrift) stableWindows++;
    }
    totalWindows++;
  }

  return {
    score:         totalWindows > 0 ? stableWindows / totalWindows : 0,
    stableWindows,
    totalWindows,
  };
}

// ─── Score de decay temporal ──────────────────────────────────────────────────
// Las apariciones recientes pesan más. halfLife = tiradas tras las que
// el peso cae al 50%. Útil para detectar si el sesgo es reciente o antiguo.
export function computeDecayScore(spins, zoneNumbers, halfLife = 30) {
  if (spins.length === 0) return { decayHits: 0, decayZ: 0 };

  const zoneSet  = new Set(zoneNumbers);
  const n        = spins.length;
  let decayHits  = 0, totalWeight = 0;

  for (let i = 0; i < n; i++) {
    const age    = n - 1 - i;
    const weight = Math.pow(0.5, age / halfLife);
    if (zoneSet.has(spins[i].number)) decayHits += weight;
    totalWeight += weight;
  }

  // Z normalizado sobre el peso total equivalente
  const effectiveN  = totalWeight;
  const decayExp    = effectiveN * ZONE_COVERAGE;
  const decaySigma  = Math.sqrt(effectiveN * ZONE_COVERAGE * (1 - ZONE_COVERAGE));
  const decayZ      = decaySigma > 0 ? (decayHits - decayExp) / decaySigma : 0;

  return {
    decayHits: parseFloat(decayHits.toFixed(3)),
    decayZ:    parseFloat(decayZ.toFixed(2)),
  };
}

// ─── Balance global del cilindro (test chi-cuadrado simplificado) ─────────────
// Mide si la distribución COMPLETA de la ruleta es uniforme.
// Un chi-cuadrado alto indica que hay sectores fríos y calientes globalmente,
// lo que da contexto para que el análisis de zona tenga sentido.
export function computeWheelBalance(spins) {
  if (spins.length < 20) return { chi2: 0, biasLevel: 'insufficient', topHot: [], topCold: [] };

  const counts = new Array(N).fill(0);
  for (const s of spins) {
    if (WHEEL_INDEX[s.number] !== undefined) counts[WHEEL_INDEX[s.number]]++;
  }

  const expected = spins.length / N;
  let chi2 = 0;
  for (const c of counts) chi2 += Math.pow(c - expected, 2) / expected;

  // Degrees of freedom = 36; critical values: p<0.10 → 47.2, p<0.05 → 50.0
  const biasLevel =
    chi2 >= 50.0 ? 'strong'    :
    chi2 >= 47.2 ? 'moderate'  :
    chi2 >= 30.0 ? 'weak'      : 'uniform';

  // Top 5 hot and cold positions
  const sorted = WHEEL_ORDER.map((num, pos) => ({ num, pos, count: counts[pos], z: (counts[pos] - expected) / Math.sqrt(expected) }))
    .sort((a, b) => b.z - a.z);

  return {
    chi2:      parseFloat(chi2.toFixed(2)),
    biasLevel,
    topHot:    sorted.slice(0, 5).map(x => ({ num: x.num, z: parseFloat(x.z.toFixed(2)) })),
    topCold:   sorted.slice(-5).reverse().map(x => ({ num: x.num, z: parseFloat(x.z.toFixed(2)) })),
  };
}

// ─── Heatmap del cilindro ─────────────────────────────────────────────────────
// Genera los datos para visualizar los 37 slots del cilindro con intensidad
// de calor basada en frecuencia con decay temporal.
export function buildCylinderHeatmap(spins, halfLife = 30) {
  const n = spins.length;
  if (n === 0) {
    return WHEEL_ORDER.map((num, pos) => ({
      pos, num, rawCount: 0, decayScore: 0, z: 0, heat: 0,
    }));
  }

  // Decay-weighted frequency per cylinder position
  const decayFreq = new Array(N).fill(0);
  const rawCount  = new Array(N).fill(0);
  let totalWeight = 0;

  for (let i = 0; i < n; i++) {
    const age    = n - 1 - i;
    const weight = Math.pow(0.5, age / halfLife);
    const pos    = WHEEL_INDEX[spins[i].number];
    if (pos !== undefined) {
      decayFreq[pos] += weight;
      rawCount[pos]++;
    }
    totalWeight += weight;
  }

  // Normalize: expected per position = totalWeight / N
  const expPerPos = totalWeight / N;
  const sigma     = Math.sqrt(expPerPos * (1 - 1 / N));

  return WHEEL_ORDER.map((num, pos) => {
    const df  = decayFreq[pos];
    const z   = sigma > 0 ? (df - expPerPos) / sigma : 0;
    const heat = Math.max(0, Math.min(1, (z + 2) / 5)); // normalize z∈[-2,3] → [0,1]
    return {
      pos, num,
      rawCount:  rawCount[pos],
      decayScore: parseFloat(df.toFixed(3)),
      z:          parseFloat(z.toFixed(2)),
      heat:       parseFloat(heat.toFixed(3)),
    };
  });
}

// ─── Calidad compuesta de zona ────────────────────────────────────────────────
// Combina z-score, persistencia, estabilidad y decay en una puntuación
// de calidad (0-100) que representa la confianza estadística de la zona.
//
// El score NO implica edge positivo garantizado.
// Edge real depende de sesgo físico de la ruleta.
export function computeZoneQuality(spins, zone) {
  if (!zone || spins.length < 20) {
    return { quality: 0, persistence: 0, stability: 0, decayZ: 0, antiSpike: false, breakdown: {} };
  }

  const { numbers, center, zScore } = zone;

  // Anti-spike: z extremadamente alto (>3.5) suele ser efímero y revertir
  const antiSpike = zScore > 3.5;

  // Componentes
  const { score: persistence }  = computeZonePersistence(spins, numbers);
  const { score: stability }    = computeZoneStability(spins, center);
  const { decayZ }              = computeDecayScore(spins, numbers);

  // Puntuación base por z-score (0-50)
  let baseScore = 0;
  if (zScore >= 2.5)       baseScore = 50;
  else if (zScore >= 2.0)  baseScore = 42;
  else if (zScore >= 1.65) baseScore = 33;
  else if (zScore >= 1.30) baseScore = 20;

  // Bonus por persistencia (0-30): zona consistentemente caliente
  const persistBonus = Math.round(persistence * 30);

  // Bonus por estabilidad (0-15): zona no se desplaza
  const stabilBonus  = Math.round(stability * 15);

  // Bonus por decay positivo (0-5): señal reciente también caliente
  const decayBonus   = decayZ >= 1.0 ? 5 : decayZ >= 0.5 ? 2 : 0;

  // Penalización anti-spike (-15)
  const spikePenalty = antiSpike ? -15 : 0;

  const quality = Math.max(0, Math.min(100,
    baseScore + persistBonus + stabilBonus + decayBonus + spikePenalty,
  ));

  return {
    quality,
    persistence:  parseFloat(persistence.toFixed(3)),
    stability:    parseFloat(stability.toFixed(3)),
    decayZ:       parseFloat(decayZ.toFixed(2)),
    antiSpike,
    breakdown: {
      baseScore, persistBonus, stabilBonus, decayBonus, spikePenalty,
    },
  };
}

// ─── Backtester determinístico ────────────────────────────────────────────────
// Reproduce el estado de VECINOS spin a spin sobre el historial de la sesión
// y calcula métricas reales de P&L. DESCRIPTIVO, no predictivo.
export function runVecinosBacktest(spins, progression, findHotZoneFn, minQuality = 0) {
  const bets = [];
  let stepIdx       = 0;
  let cycleInvested = 0;
  let blockedUntil  = -1;
  let inCycle       = false;
  let activeSet     = null;
  let chipsPerNum   = 0;
  let totalChips    = 0;

  const COOL_SPINS = 10;
  const ANALYSIS_WINDOW = 20;

  for (let i = 0; i < spins.length; i++) {
    if (i <= blockedUntil) continue;
    if (i < ANALYSIS_WINDOW) continue;

    const prev = spins.slice(0, i);

    if (!inCycle) {
      const zone = findHotZoneFn(prev);
      if (!zone) continue;
      inCycle       = true;
      stepIdx       = 0;
      cycleInvested = 0;
      activeSet     = new Set(zone.numbers);
      chipsPerNum   = progression[0].chipsPerNumber;
      totalChips    = progression[0].totalChips;
    } else {
      chipsPerNum = progression[stepIdx].chipsPerNumber;
      totalChips  = progression[stepIdx].totalChips;
    }

    const isWin  = activeSet.has(spins[i].number);
    const profit = isWin ? 27 * chipsPerNum : -totalChips;

    bets.push({
      spinIndex: i,
      number:    spins[i].number,
      step:      stepIdx + 1,
      chips:     totalChips,
      isWin,
      profit,
    });

    if (isWin) {
      inCycle       = false;
      activeSet     = null;
      stepIdx       = 0;
      cycleInvested = 0;
    } else {
      cycleInvested += totalChips;
      if (stepIdx >= progression.length - 1) {
        inCycle       = false;
        activeSet     = null;
        blockedUntil  = i + COOL_SPINS;
        stepIdx       = 0;
        cycleInvested = 0;
      } else {
        stepIdx++;
      }
    }
  }

  if (bets.length === 0) {
    return {
      bets, totalBets: 0, wins: 0, losses: 0,
      totalProfit: 0, totalWagered: 0, hitRate: 0, roi: 0,
      maxDrawdown: 0, peakBalance: 0,
    };
  }

  // Compute cumulative metrics
  let balance = 0, peak = 0, maxDrawdown = 0, totalWagered = 0;
  for (const b of bets) {
    balance     += b.profit;
    totalWagered += b.chips;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;
    b.balanceAfter = balance;
  }

  const wins   = bets.filter(b => b.isWin).length;
  const losses = bets.length - wins;

  return {
    bets,
    totalBets:    bets.length,
    wins,
    losses,
    totalProfit:  balance,
    totalWagered,
    hitRate:      parseFloat((wins / bets.length).toFixed(3)),
    roi:          totalWagered > 0 ? parseFloat(((balance / totalWagered) * 100).toFixed(2)) : 0,
    maxDrawdown,
    peakBalance:  peak,
  };
}

// ─── Interno: encontrar mejor centro en raw (sin thresholds) ─────────────────
function _findBestCenterRaw(spins) {
  const freq = new Array(N).fill(0);
  for (const s of spins) {
    const pos = WHEEL_INDEX[s.number];
    if (pos !== undefined) freq[pos]++;
  }

  let bestCenter = -1, bestHits = 0;
  for (let center = 0; center < N; center++) {
    let hits = 0;
    for (let d = -4; d <= 4; d++) hits += freq[(center + d + N) % N];
    if (hits > bestHits) { bestHits = hits; bestCenter = center; }
  }

  return { bestCenter, bestHits };
}
