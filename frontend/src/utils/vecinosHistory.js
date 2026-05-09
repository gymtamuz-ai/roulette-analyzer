// ═══════════════════════════════════════════════════════════════════════════════
// VECINOS — Memoria Histórica + Convergencia (Fase 3)
//
// Detecta si una zona caliente LOCAL (sesión actual) está CONFIRMADA por el
// historial de bloques de 36 tiradas almacenados en hot_windows.
//
// ARQUITECTURA:
//   hot_windows (DB) → /api/table-memory/:id/blocks → blocks[]
//   blocks[] → computeHistoricalFreq() → posFreq[] (decay-weighted)
//   posFreq[] → findHistoricalHotZone() → historicalZone
//   localSpins → findHotZone() [de vecinos.js] → localZone
//   localZone + historicalZone → computeConvergentZone() → convergenceResult
//
// LIMITACIONES (honestidad matemática):
//   • Mínimo 150 spins históricos antes de usar la memoria global
//   • Un z histórico de 1.0 con 360 spins equivale a p≈0.16, NO es señal fuerte
//   • Convergencia LOCAL+HISTÓRICO NO multiplica evidencia; solo confirma
//     que el patrón no es ruido de corto plazo
//   • Edge real SÓLO existe si la ruleta tiene sesgo físico estable
// ═══════════════════════════════════════════════════════════════════════════════

import { findHotZone } from './vecinos';

// Orden físico del cilindro europeo (duplicado para evitar dependencia circular)
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];
const N = 37;
const WHEEL_INDEX = {};
for (let i = 0; i < N; i++) WHEEL_INDEX[WHEEL_ORDER[i]] = i;

const ZONE_RADIUS = 4;

// ─── Parámetros históricos ────────────────────────────────────────────────────
export const MIN_HIST_SPINS      = 150;  // mínimo de spins históricos para usar memoria
export const HIST_Z_THRESHOLD    = 1.0;  // umbral z histórico (más bajo porque hay más datos)
export const LOCAL_Z_THRESHOLD   = 1.63; // umbral z local (sin cambio respecto a Fase 2)
export const MIN_OVERLAP         = 5;    // de 9 números, al menos 5 deben coincidir
export const HIST_HALFLIFE_BLOCKS = 10;  // bloques (=360 spins) para half-life de decay

// ─── Decay-weighted frequency map desde bloques históricos ───────────────────
// Cada bloque tiene 36 spins. El bloque más reciente tiene peso 1.0;
// un bloque HIST_HALFLIFE_BLOCKS bloques antes tiene peso 0.5.
//
// w(i) = 0.5 ^ ((N-1-i) / H)     donde i=0 es el más antiguo, i=N-1 el más reciente
//
// Devuelve:
//   posFreq[pos]         — hits ponderados para la posición del cilindro `pos`
//   totalWeightedSpins   — suma de (36 × weight) sobre todos los bloques
//   totalBlocks          — cantidad de bloques
export function computeHistoricalFreq(blocks, halfLifeBlocks = HIST_HALFLIFE_BLOCKS) {
  const posFreq = new Array(N).fill(0);

  if (!blocks || blocks.length === 0) {
    return { posFreq, totalWeightedSpins: 0, totalBlocks: 0 };
  }

  const totalBlocks = blocks.length;
  let totalWeightedSpins = 0;

  for (let i = 0; i < totalBlocks; i++) {
    const age    = totalBlocks - 1 - i;  // 0 para el más reciente
    const weight = Math.pow(0.5, age / halfLifeBlocks);
    totalWeightedSpins += 36 * weight;

    const block = blocks[i];
    if (!block.numbers) continue;

    for (const { num, count } of block.numbers) {
      const pos = WHEEL_INDEX[num];
      if (pos !== undefined) {
        posFreq[pos] += count * weight;
      }
    }
  }

  return {
    posFreq,
    totalWeightedSpins: parseFloat(totalWeightedSpins.toFixed(2)),
    totalBlocks,
  };
}

// ─── Detección de zona caliente en datos históricos (decay-weighted) ──────────
// Funciona igual que findHotZone pero sobre posFreq ponderado.
// El z-score usa totalWeightedSpins como el "N efectivo".
export function findHistoricalHotZone(posFreq, totalWeightedSpins) {
  if (totalWeightedSpins < MIN_HIST_SPINS) return null;

  const p        = (2 * ZONE_RADIUS + 1) / N;  // 9/37
  const expected = totalWeightedSpins * p;
  const sigma    = Math.sqrt(totalWeightedSpins * p * (1 - p));
  if (sigma <= 0) return null;

  let bestCenter = 0, bestHits = 0;
  for (let center = 0; center < N; center++) {
    let hits = 0;
    for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
      hits += posFreq[(center + d + N) % N];
    }
    if (hits > bestHits) { bestHits = hits; bestCenter = center; }
  }

  const zScore = (bestHits - expected) / sigma;
  if (zScore < HIST_Z_THRESHOLD) return null;

  const numbers = [];
  for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
    numbers.push(WHEEL_ORDER[(bestCenter + d + N) % N]);
  }

  return {
    center:      WHEEL_ORDER[bestCenter],
    numbers,
    hits:        parseFloat(bestHits.toFixed(2)),
    expected:    parseFloat(expected.toFixed(2)),
    sigma:       parseFloat(sigma.toFixed(2)),
    zScore:      parseFloat(zScore.toFixed(2)),
    isHistorical: true,
  };
}

// ─── Solapamiento entre dos zonas ─────────────────────────────────────────────
// Cuenta cuántos números tienen en común zona A y zona B.
function zoneOverlap(numbersA, numbersB) {
  const setB = new Set(numbersB);
  return numbersA.filter(n => setB.has(n)).length;
}

// ─── Estado de convergencia entre señal local e histórica ────────────────────
// Retorna uno de 5 estados:
//
//   CONVERGENTE  — ambas señales activas apuntando a la misma zona (≥5/9 solapamiento)
//   LOCAL        — solo señal local activa (sin historia suficiente o historia discrepa)
//   HISTÓRICO    — historia confirma pero señal local aún no llega al umbral
//   DIVERGENTE   — ambas señales activas pero apuntan a zonas DISTINTAS (<5/9 solapamiento)
//   NEUTRAL      — sin señal en ningún lado
export function computeConvergentZone(localSpins, blocks, opts = {}) {
  const { halfLifeBlocks = HIST_HALFLIFE_BLOCKS } = opts;

  // ── Señal local ──
  const localZone = findHotZone(localSpins);
  const localZ    = localZone?.zScore ?? 0;
  const hasLocalSignal = localZone !== null;

  // ── Señal histórica ──
  const { posFreq, totalWeightedSpins, totalBlocks } = computeHistoricalFreq(blocks, halfLifeBlocks);
  const totalHistoricalSpins = Math.round(totalBlocks * 36);
  const hasEnoughHistory     = totalHistoricalSpins >= MIN_HIST_SPINS;

  const historicalZone = hasEnoughHistory
    ? findHistoricalHotZone(posFreq, totalWeightedSpins)
    : null;
  const historicalZ    = historicalZone?.zScore ?? 0;
  const hasHistSignal  = historicalZone !== null;

  // ── Determinar convergencia ──
  let convergenceState;
  let overlapCount = 0;

  if (hasLocalSignal && hasHistSignal) {
    overlapCount = zoneOverlap(localZone.numbers, historicalZone.numbers);
    convergenceState = overlapCount >= MIN_OVERLAP ? 'CONVERGENTE' : 'DIVERGENTE';
  } else if (hasLocalSignal) {
    convergenceState = 'LOCAL';
  } else if (hasHistSignal && !hasLocalSignal) {
    convergenceState = 'HISTÓRICO';
  } else {
    convergenceState = 'NEUTRAL';
  }

  // La zona confirmada para apostar:
  //   CONVERGENTE → zona local (más reciente, más específica)
  //   LOCAL       → zona local (señal válida aunque sin confirmación histórica)
  //   Otros       → null (no apostar por este mecanismo)
  const confirmedNumbers =
    (convergenceState === 'CONVERGENTE' || convergenceState === 'LOCAL')
      ? localZone?.numbers ?? null
      : null;

  return {
    convergenceState,
    hasEnoughHistory,
    totalHistoricalSpins,
    totalBlocks,
    localZone,
    historicalZone,
    localZ:      parseFloat(localZ.toFixed(2)),
    historicalZ: parseFloat(historicalZ.toFixed(2)),
    overlapCount,
    confirmedNumbers,
  };
}

// ─── Bonus de score para autoSystem.js ───────────────────────────────────────
// Retorna un delta (+/-) a aplicar al score base de VECINOS.
// CONVERGENTE  → +15  (señal doble mucho más confiable)
// DIVERGENTE   → -20  (señal conflictiva; mejor no apostar)
// LOCAL/otros  → 0
export function getConvergenceScoreBonus(convergenceState) {
  if (convergenceState === 'CONVERGENTE') return 15;
  if (convergenceState === 'DIVERGENTE')  return -20;
  return 0;
}
