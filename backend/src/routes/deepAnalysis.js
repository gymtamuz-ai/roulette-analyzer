// ═══════════════════════════════════════════════════════════════════════════════
// DEEP STATISTICAL ANALYSIS ENDPOINT
// GET /api/deep-analysis/:tableId
//
// Full wheel-bias + strategy-performance analysis for a table's complete
// spin history. Designed for 1000–10000+ spin datasets.
//
// Statistical methods:
//   • Chi-square goodness-of-fit (uniform distribution H₀)
//   • Z-score per number  (individual deviation significance)
//   • Binomial confidence intervals
//   • Physical wheel arc analysis (5-pocket sliding window)
//   • AXIS 6×6 sector analysis (H and V)
//   • Temporal drift (first-half vs second-half bias stability)
//   • Strategy P&L comparison from session_results
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const pool    = require('../db');

// ─── European wheel order ─────────────────────────────────────────────────────
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13,
  36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

// ─── AXIS 6×6 grid ────────────────────────────────────────────────────────────
const AXIS_GRID = [
  [32, 15, 19,  4, 21,  2],  // H1
  [25, 17, 34,  6, 27, 13],  // H2
  [36, 11, 30,  8, 23, 10],  // H3
  [ 5, 24, 16, 33,  1, 20],  // H4
  [14, 31,  9, 22, 18, 29],  // H5
  [ 7, 28, 12, 35,  3, 26],  // H6
];

const NUMBER_TO_H = {};
const NUMBER_TO_V = {};
for (let row = 0; row < 6; row++) {
  for (let col = 0; col < 6; col++) {
    const n = AXIS_GRID[row][col];
    NUMBER_TO_H[n] = row + 1;
    NUMBER_TO_V[n] = col + 1;
  }
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

/** Normal CDF approximation (for p-value computation) */
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

/** Two-tailed p-value from z-score */
function zToPValue(z) {
  return 2 * normalCDF(-Math.abs(z));
}

/** Significance label */
function sigLabel(pValue) {
  if (pValue < 0.001) return '***';
  if (pValue < 0.01)  return '**';
  if (pValue < 0.05)  return '*';
  return '';
}

/** Chi-square survival function approximation (degrees of freedom k) */
function chiSquarePValue(chi2, k) {
  // Wilson-Hilferty approximation
  const h = 2 / (9 * k);
  const z = (Math.pow(chi2 / k, 1/3) - (1 - h)) / Math.sqrt(h);
  return 1 - normalCDF(z);
}

// ─── Main analysis ────────────────────────────────────────────────────────────

router.get('/:tableId', async (req, res) => {
  const { tableId } = req.params;
  const minWindow = parseInt(req.query.minWindow || '5');  // arc window size

  try {
    // ── Fetch all spins for this table in correct chronological order ──────────
    // Cross-session ordering: sessions.started_at ASC → spins.spin_order ASC
    const { rows: spins } = await pool.query(
      `SELECT s.number, s.color, s.parity, s.dozen, s.col,
              s.sector_a3, s.sector_a4, s.spun_at,
              sess.name as session_name
       FROM spins s
       JOIN sessions sess ON sess.id = s.session_id
       WHERE s.table_id = $1
       ORDER BY sess.started_at ASC, s.spin_order ASC`,
      [tableId]
    );

    const N = spins.length;
    if (N < 50) return res.json({ error: 'Not enough spins', N });

    // ── Fetch strategy results for this table ───────────────────────────────
    const { rows: results } = await pool.query(
      `SELECT sr.system_type, sr.result, sr.profit, sr.bet_chips
       FROM session_results sr
       JOIN sessions sess ON sess.id = sr.session_id
       WHERE sess.table_id = $1`,
      [tableId]
    );

    // ── Fetch table metadata ────────────────────────────────────────────────
    const { rows: [table] } = await pool.query(
      'SELECT name FROM tables WHERE id = $1',
      [tableId]
    );

    // ────────────────────────────────────────────────────────────────────────
    // 1. NUMBER FREQUENCY ANALYSIS
    // ────────────────────────────────────────────────────────────────────────
    const freq = {};
    for (let i = 0; i <= 36; i++) freq[i] = 0;
    for (const s of spins) freq[s.number] = (freq[s.number] || 0) + 1;

    const expected = N / 37;
    let chiSquare = 0;
    const numberStats = [];

    for (let num = 0; num <= 36; num++) {
      const f   = freq[num];
      const dev = f - expected;
      const z   = dev / Math.sqrt(expected);   // Poisson approx std dev
      const p   = zToPValue(z);
      chiSquare += (dev * dev) / expected;
      numberStats.push({
        number:    num,
        hits:      f,
        expected:  parseFloat(expected.toFixed(1)),
        deviation: parseFloat(((f - expected) / expected * 100).toFixed(2)),  // %
        zScore:    parseFloat(z.toFixed(3)),
        pValue:    parseFloat(p.toFixed(4)),
        sig:       sigLabel(p),
      });
    }

    numberStats.sort((a, b) => b.zScore - a.zScore);
    const chiP = chiSquarePValue(chiSquare, 36);

    const hotNumbers  = numberStats.slice(0, 10);
    const coldNumbers = [...numberStats].sort((a, b) => a.zScore - b.zScore).slice(0, 10);
    const significantNumbers = numberStats.filter(s => s.pValue < 0.05);

    // ────────────────────────────────────────────────────────────────────────
    // 2. PHYSICAL WHEEL ARC ANALYSIS
    //    Sliding window of W pockets across the wheel
    // ────────────────────────────────────────────────────────────────────────
    const wheelFreqs = WHEEL_ORDER.map(n => freq[n] || 0);
    const W = minWindow;  // window size

    const arcAnalysis = [];
    for (let i = 0; i < WHEEL_ORDER.length; i++) {
      let sum = 0;
      const nums = [];
      for (let j = 0; j < W; j++) {
        const idx = (i + j) % WHEEL_ORDER.length;
        sum += wheelFreqs[idx];
        nums.push(WHEEL_ORDER[idx]);
      }
      const expectedArc = expected * W;
      const ratio = sum / expectedArc;
      const z = (sum - expectedArc) / Math.sqrt(expectedArc);
      const p = zToPValue(z);
      arcAnalysis.push({
        startIndex: i,
        anchor:     WHEEL_ORDER[i],
        numbers:    nums,
        hits:       sum,
        expected:   parseFloat(expectedArc.toFixed(1)),
        ratio:      parseFloat(ratio.toFixed(3)),
        zScore:     parseFloat(z.toFixed(3)),
        pValue:     parseFloat(p.toFixed(4)),
        sig:        sigLabel(p),
      });
    }

    arcAnalysis.sort((a, b) => b.zScore - a.zScore);
    const hotArcs  = arcAnalysis.filter(a => a.zScore > 0).slice(0, 5);
    const coldArcs = arcAnalysis.filter(a => a.zScore < 0).sort((a, b) => a.zScore - b.zScore).slice(0, 5);

    // ────────────────────────────────────────────────────────────────────────
    // 3. AXIS SECTOR ANALYSIS (H1-H6 and V1-V6)
    // ────────────────────────────────────────────────────────────────────────
    const hFreq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const vFreq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let nonZeroN = 0;

    for (const s of spins) {
      const n = s.number;
      if (n === 0) continue;
      nonZeroN++;
      if (NUMBER_TO_H[n]) hFreq[NUMBER_TO_H[n]]++;
      if (NUMBER_TO_V[n]) vFreq[NUMBER_TO_V[n]]++;
    }

    const expectedSector = nonZeroN / 6;  // 6 numbers per sector

    function scoreSector(f) {
      const z = (f - expectedSector) / Math.sqrt(expectedSector);
      const p = zToPValue(z);
      return {
        hits:      f,
        expected:  parseFloat(expectedSector.toFixed(1)),
        deviation: parseFloat(((f - expectedSector) / expectedSector * 100).toFixed(2)),
        zScore:    parseFloat(z.toFixed(3)),
        pValue:    parseFloat(p.toFixed(4)),
        sig:       sigLabel(p),
      };
    }

    const hSectors = {};
    const vSectors = {};
    for (let s = 1; s <= 6; s++) {
      hSectors[`H${s}`] = { numbers: AXIS_GRID[s - 1], ...scoreSector(hFreq[s]) };
      vSectors[`V${s}`] = { numbers: AXIS_GRID.map(row => row[s - 1]), ...scoreSector(vFreq[s]) };
    }

    const axisSorted = [
      ...Object.entries(hSectors).map(([k, v]) => ({ sector: k, ...v })),
      ...Object.entries(vSectors).map(([k, v]) => ({ sector: k, ...v })),
    ].sort((a, b) => b.zScore - a.zScore);

    // ────────────────────────────────────────────────────────────────────────
    // 4. COLOR / PARITY / DOZEN / COLUMN ANALYSIS
    //    Uses CORRECT European roulette probabilities per category.
    //    Previous version used N/3 or N/4 for all categories — WRONG.
    //
    //    European roulette (37 numbers, single zero):
    //      red   : 18/37 ≈ 48.65%   black: 18/37 ≈ 48.65%   green: 1/37 ≈ 2.70%
    //      odd   : 18/37            even : 18/37             zero : 1/37
    //      dozens: 12/37 each (zero belongs to no dozen)
    //      cols  : 12/37 each (zero belongs to no column)
    //
    //    Standard error uses binomial σ = √(n·p·(1−p)) — correct for any p.
    //    Poisson approximation √(np) is only valid for p << 1 (i.e., single numbers).
    // ────────────────────────────────────────────────────────────────────────
    const groupFreq = { color: {}, parity: {}, dozen: {}, col: {} };
    for (const s of spins) {
      for (const key of ['color', 'parity', 'dozen', 'col']) {
        const v = s[key];
        if (v != null && v !== '') groupFreq[key][v] = (groupFreq[key][v] || 0) + 1;
      }
    }

    // European roulette probability map for each category value
    const ROULETTE_PROBS = {
      color:  { red: 18/37, black: 18/37, green: 1/37 },
      parity: { odd: 18/37, even: 18/37, zero: 1/37 },
      // dozen/col: zero excluded from these columns (DB stores null for zero)
      // → reference population is nonZeroN, prob = 12/36 = 1/3 per bucket
      dozen: null,  // computed dynamically from nonZeroN below
      col:   null,
    };

    /**
     * analyzeGroupWithProbs — statistically correct group analysis
     * @param {Object} counts       map of category → observed hits
     * @param {Object|null} probMap map of category → true probability (null = equal priors)
     * @param {number} totalN       reference population size
     */
    function analyzeGroupWithProbs(counts, probMap, totalN) {
      const categories = Object.keys(counts);
      const equalProb  = 1 / categories.length;

      return categories.map(cat => {
        const hits   = counts[cat];
        const prob   = probMap ? (probMap[cat] ?? equalProb) : equalProb;
        const expCat = totalN * prob;
        // Binomial std dev — correct for ANY probability (incl. p close to 0.5)
        const sigma  = Math.sqrt(totalN * prob * (1 - prob));
        const z      = sigma > 0 ? (hits - expCat) / sigma : 0;
        const p      = zToPValue(z);
        return {
          category:  String(cat),
          hits,
          expected:  parseFloat(expCat.toFixed(1)),
          prob:      parseFloat((prob * 100).toFixed(2)),  // % theoretical
          deviation: parseFloat(((hits - expCat) / expCat * 100).toFixed(2)),
          zScore:    parseFloat(z.toFixed(3)),
          pValue:    parseFloat(p.toFixed(4)),
          sig:       sigLabel(p),
        };
      }).sort((a, b) => b.zScore - a.zScore);
    }

    // Color: 18 red, 18 black, 1 green — reference N = total spins
    const colorAnalysis = analyzeGroupWithProbs(groupFreq.color, ROULETTE_PROBS.color, N);

    // Parity: 18 odd, 18 even, 1 zero — reference N = total spins
    const parityAnalysis = analyzeGroupWithProbs(groupFreq.parity, ROULETTE_PROBS.parity, N);

    // Dozen: 12/36 = 1/3 each, zero excluded — reference N = nonZeroN
    // (DB stores dozen=null for zero, so groupFreq.dozen only has values 1-3)
    const dozenProbs = Object.fromEntries(
      Object.keys(groupFreq.dozen).map(k => [k, 12/36])
    );
    const dozenAnalysis = analyzeGroupWithProbs(groupFreq.dozen, dozenProbs, nonZeroN);

    // Column: same structure as dozen
    const colProbs = Object.fromEntries(
      Object.keys(groupFreq.col).map(k => [k, 12/36])
    );
    const columnAnalysis = analyzeGroupWithProbs(groupFreq.col, colProbs, nonZeroN);

    // ────────────────────────────────────────────────────────────────────────
    // 5. TEMPORAL BIAS STABILITY
    //    Compare first half vs second half — is the bias consistent?
    // ────────────────────────────────────────────────────────────────────────
    const half = Math.floor(N / 2);
    const firstHalf  = spins.slice(0, half);
    const secondHalf = spins.slice(half);

    function halfFreq(spinArr) {
      const f = {};
      for (let i = 0; i <= 36; i++) f[i] = 0;
      for (const s of spinArr) f[s.number]++;
      return f;
    }

    const f1 = halfFreq(firstHalf);
    const f2 = halfFreq(secondHalf);

    // Numbers whose bias PERSISTS across both halves (most reliable)
    const persistentBias = numberStats.filter(s => {
      const d1 = f1[s.number] / (half / 37) - 1;
      const d2 = f2[s.number] / ((N - half) / 37) - 1;
      return Math.sign(d1) === Math.sign(d2) && Math.abs(d1) > 0.1 && Math.abs(d2) > 0.1;
    }).map(s => ({
      number:  s.number,
      zTotal:  s.zScore,
      hits:    s.hits,
      dev1H:   parseFloat(((f1[s.number] / (half / 37) - 1) * 100).toFixed(1)),
      dev2H:   parseFloat(((f2[s.number] / ((N - half) / 37) - 1) * 100).toFixed(1)),
      consistent: true,
    })).sort((a, b) => Math.abs(b.zTotal) - Math.abs(a.zTotal)).slice(0, 12);

    // ────────────────────────────────────────────────────────────────────────
    // 6. ECHO REPEAT ANALYSIS
    //    How often do numbers repeat? (base for ECHO strategy)
    // ────────────────────────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────────────────────
    // 6. ECHO REPEAT ANALYSIS — O(n) sliding window (was O(n²))
    //    For each window size W: tracks what fraction of spins repeat a number
    //    seen in the previous W spins. Uses a Map as a count-per-number in window.
    // ────────────────────────────────────────────────────────────────────────
    const WINDOWS = [10, 20, 36, 50, 100];
    const repeatAnalysis = {};

    for (const W of WINDOWS) {
      // windowCounts: number → count of occurrences in current [i-W, i-1] window
      const windowCounts = new Map();
      let totalRepeats = 0;
      let samples = 0;

      // Pre-fill window with spins[0..W-1]
      for (let k = 0; k < W && k < spins.length; k++) {
        const n = spins[k].number;
        windowCounts.set(n, (windowCounts.get(n) || 0) + 1);
      }

      // For each spin at index i (starting at W), check if it's in [i-W, i-1]
      for (let i = W; i < spins.length; i++) {
        const num = spins[i].number;
        if (windowCounts.has(num)) totalRepeats++;
        samples++;

        // Slide: remove spins[i-W], add spins[i]
        const leaving = spins[i - W].number;
        const prevCnt = windowCounts.get(leaving) || 0;
        if (prevCnt <= 1) windowCounts.delete(leaving);
        else windowCounts.set(leaving, prevCnt - 1);

        windowCounts.set(num, (windowCounts.get(num) || 0) + 1);
      }

      // Expected repeat rate on a fair 37-number wheel:
      //   P(repeat in W) = 1 − (36/37)(35/37)…((37-W)/37)  [birthday problem]
      //   Approximation for display: 1 − exp(−W*(W-1)/(2*37))
      const fairRepeatRate = parseFloat(
        ((1 - Math.exp(-W * (W - 1) / (2 * 37))) * 100).toFixed(1)
      );

      repeatAnalysis[W] = {
        window:        W,
        repeatRate:    samples > 0 ? parseFloat((totalRepeats / samples * 100).toFixed(1)) : 0,
        fairRate:      fairRepeatRate,   // expected on a fair wheel
        repeats:       totalRepeats,
        samples,
      };
    }

    // ────────────────────────────────────────────────────────────────────────
    // 7. STRATEGY PERFORMANCE COMPARISON
    // ────────────────────────────────────────────────────────────────────────
    const strategyMap = {};
    for (const r of results) {
      const sys = r.system_type || 'UNKNOWN';
      if (!strategyMap[sys]) {
        strategyMap[sys] = { system: sys, bets: 0, wins: 0, losses: 0, profit: 0, wagered: 0 };
      }
      const s = strategyMap[sys];
      s.bets++;
      s.profit += (r.profit || 0);
      s.wagered += Math.abs(r.bet_chips || 0);
      if (r.result === 'win') s.wins++;
      else s.losses++;
    }

    const strategyStats = Object.values(strategyMap).map(s => ({
      ...s,
      winrate:      s.bets > 0 ? Math.round(s.wins / s.bets * 100) : 0,
      roi:          s.wagered > 0 ? parseFloat((s.profit / s.wagered * 100).toFixed(2)) : 0,
      avgProfit:    s.bets > 0 ? parseFloat((s.profit / s.bets).toFixed(2)) : 0,
    })).sort((a, b) => b.profit - a.profit);

    // ────────────────────────────────────────────────────────────────────────
    // 8. WHEEL BIAS SUMMARY — TOP PHYSICAL ZONES
    //    Non-overlapping hot zones with significance
    // ────────────────────────────────────────────────────────────────────────
    const usedIndices = new Set();
    const topZones = [];

    for (const arc of arcAnalysis.filter(a => a.zScore > 1.5)) {
      if (arc.numbers.some(n => usedIndices.has(n))) continue;
      arc.numbers.forEach(n => usedIndices.add(n));
      topZones.push(arc);
      if (topZones.length >= 4) break;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 9. OVERALL BIAS SCORE
    // ────────────────────────────────────────────────────────────────────────
    const biasScore = Math.min(100, Math.round(
      (chiSquare / 36) * 15 +
      significantNumbers.length * 5 +
      topZones.length * 10
    ));

    const biasLevel = biasScore >= 70 ? 'FUERTE'
                    : biasScore >= 40 ? 'MODERADO'
                    : biasScore >= 15 ? 'LEVE'
                    : 'NO DETECTADO';

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
      // Metadata
      tableId,
      tableName:       table?.name ?? `Mesa ${tableId}`,
      totalSpins:      N,
      nonZeroSpins:    nonZeroN,
      generatedAt:     new Date().toISOString(),

      // Overall bias assessment
      overallBias: {
        score:              biasScore,
        level:              biasLevel,
        chiSquare:          parseFloat(chiSquare.toFixed(2)),
        chiSquareDf:        36,
        chiSquarePValue:    parseFloat(chiP.toFixed(6)),
        chiSquareSig:       sigLabel(chiP),
        significantNumbers: significantNumbers.length,
        interpretation:     chiP < 0.01
          ? `Distribución NO uniforme (p=${chiP.toFixed(4)}) — desviación estadísticamente significativa`
          : chiP < 0.05
          ? `Posible desviación (p=${chiP.toFixed(4)}) — borderline significativo`
          : `Distribución compatible con uniforme (p=${chiP.toFixed(4)}) — sin sesgo detectable`,
      },

      // Number-level
      hotNumbers:          hotNumbers,
      coldNumbers:         coldNumbers,
      significantNumbers,
      persistentBias,

      // Physical wheel
      wheelArcAnalysis: {
        windowSize:  W,
        hotArcs,
        coldArcs,
        topBiasZones: topZones,
      },

      // AXIS sectors
      axisAnalysis: {
        hSectors,
        vSectors,
        rankedSectors: axisSorted,
        topSectors:    axisSorted.slice(0, 4),
        bottomSectors: axisSorted.slice(-4).reverse(),
      },

      // Group analysis
      colorAnalysis,
      parityAnalysis,
      dozenAnalysis,
      columnAnalysis,

      // Temporal
      temporalStability: {
        firstHalfSpins:  half,
        secondHalfSpins: N - half,
        persistentBias,
        note: persistentBias.length > 3
          ? 'Sesgo persistente: varios números mantienen su tendencia en ambas mitades del historial'
          : 'Sin sesgo persistente claro entre las dos mitades del historial',
      },

      // ECHO repeat analysis
      repeatAnalysis,

      // Strategy performance
      strategyStats,
    });

  } catch (err) {
    console.error('[deep-analysis]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
