// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA VECINOS
// Ventana deslizante de densidad sobre el cilindro físico europeo.
// Detecta zonas de 9 números consecutivos (radio ±4) con alta frecuencia
// y activa una progresión de 5 pasos recovery-positive.
// ═══════════════════════════════════════════════════════════════════════════════

// Orden físico del cilindro europeo (37 posiciones)
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];
const N = WHEEL_ORDER.length; // 37

// Mapa: número → índice en el cilindro
const WHEEL_INDEX = {};
for (let i = 0; i < N; i++) WHEEL_INDEX[WHEEL_ORDER[i]] = i;

// ─── Parámetros ───────────────────────────────────────────────────────────────
export const ZONE_RADIUS     = 4;   // ±4 = 9 posiciones continuas
export const ANALYSIS_WINDOW = 20;  // últimas N tiradas para evaluar densidad
export const MIN_ZONE_HITS   = 7;   // hits mínimos en la zona para activar
export const COOL_SPINS      = 10;  // tiradas de pausa tras ciclo fallido
export const MAX_STEPS       = 5;   // pasos máximos antes de abortar ciclo

// ─── Progresión (recovery-positive) ──────────────────────────────────────────
// 9 plenos apostados · pago 35:1 · net/apuesta = 36c – 9c = 27 × chipsPerNumber
//
//  Paso  chips/num  total   net_acum_si_acierta
//   1       1         9       +27
//   2       2        18       +45   (27×2 − 9)
//   3       3        27       +54   (27×3 − 27)
//   4       4        36       +54   (27×4 − 54)
//   5       6        54       +72   (27×6 − 90)
//
// Pérdida máxima acumulada (5 pasos sin ganar): 9+18+27+36+54 = 144 fichas
export const VECINOS_PROGRESSION = [
  { step: 1, chipsPerNumber: 1, totalChips: 9  },
  { step: 2, chipsPerNumber: 2, totalChips: 18 },
  { step: 3, chipsPerNumber: 3, totalChips: 27 },
  { step: 4, chipsPerNumber: 4, totalChips: 36 },
  { step: 5, chipsPerNumber: 6, totalChips: 54 },
];

// ─── Detección de zona caliente ───────────────────────────────────────────────
export function findHotZone(spins) {
  if (spins.length < ANALYSIS_WINDOW) return null;

  const recent = spins.slice(-ANALYSIS_WINDOW);

  // Frecuencia por posición en el cilindro
  const freq = new Array(N).fill(0);
  for (const s of recent) {
    const pos = WHEEL_INDEX[s.number];
    if (pos !== undefined) freq[pos]++;
  }

  // Deslizar ventana de 9 posiciones sobre el cilindro (circular)
  let bestCenter = 0;
  let bestHits   = 0;
  for (let center = 0; center < N; center++) {
    let hits = 0;
    for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
      hits += freq[(center + d + N) % N];
    }
    if (hits > bestHits) { bestHits = hits; bestCenter = center; }
  }

  if (bestHits < MIN_ZONE_HITS) return null;

  // Números de la zona en orden de cilindro (centro primero en la lista)
  const numbers = [];
  for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
    numbers.push(WHEEL_ORDER[(bestCenter + d + N) % N]);
  }

  // Estadísticas de confianza (z-score binomial)
  const p        = (2 * ZONE_RADIUS + 1) / N;                  // 9/37 ≈ 0.2432
  const expected = ANALYSIS_WINDOW * p;                          // ≈ 4.86
  const sigma    = Math.sqrt(ANALYSIS_WINDOW * p * (1 - p));    // ≈ 1.92
  const zScore   = sigma > 0 ? (bestHits - expected) / sigma : 0;

  return {
    center:   WHEEL_ORDER[bestCenter],
    numbers,
    hits:     bestHits,
    expected: parseFloat(expected.toFixed(2)),
    sigma:    parseFloat(sigma.toFixed(2)),
    zScore:   parseFloat(zScore.toFixed(2)),
  };
}

// ─── Motor de estado principal (replay determinístico) ────────────────────────
export function computeVecinosState(spins) {
  if (!spins) spins = [];

  let stepIdx        = 0;
  let cycleInvested  = 0;   // chips perdidos en pasos anteriores del ciclo actual
  let blockedUntil   = -1;
  let inCycle        = false;
  let activeSet      = null; // Set<number> para O(1) lookup
  let activeNums     = null; // number[] en orden de cilindro
  let activeZoneInfo = null;
  let cyclesCompleted = 0;
  let cyclesAborted   = 0;

  for (let i = 0; i < spins.length; i++) {
    if (i <= blockedUntil) continue;                    // COOLING
    if (i < ANALYSIS_WINDOW) continue;                  // WAITING

    const prevSpins = spins.slice(0, i);

    if (!inCycle) {
      const zone = findHotZone(prevSpins);
      if (!zone) continue;                              // STANDBY
      inCycle        = true;
      stepIdx        = 0;
      cycleInvested  = 0;
      activeSet      = new Set(zone.numbers);
      activeNums     = zone.numbers;
      activeZoneInfo = zone;
    }

    // ACTIVE: evaluar resultado de esta tirada
    const isWin = activeSet.has(spins[i].number);

    if (isWin) {
      cyclesCompleted++;
      inCycle        = false;
      activeSet      = null;
      activeNums     = null;
      activeZoneInfo = null;
      stepIdx        = 0;
      cycleInvested  = 0;
    } else {
      cycleInvested += VECINOS_PROGRESSION[stepIdx].totalChips;
      if (stepIdx >= MAX_STEPS - 1) {
        // Ciclo agotado — cooldown
        cyclesAborted++;
        inCycle        = false;
        activeSet      = null;
        activeNums     = null;
        activeZoneInfo = null;
        blockedUntil   = i + COOL_SPINS;
        stepIdx        = 0;
        cycleInvested  = 0;
      } else {
        stepIdx++;
      }
    }
  }

  // ── Determinar estado actual ──────────────────────────────────────────────
  const lastIdx = spins.length - 1;

  // COOLING
  if (spins.length > 0 && lastIdx <= blockedUntil) {
    const spinsRemaining = blockedUntil - lastIdx;
    return {
      status: 'COOLING', isActive: false,
      reason: `Cooldown tras ciclo fallido · ${spinsRemaining} tirada${spinsRemaining !== 1 ? 's' : ''} restantes`,
      spinsRemaining,
      cyclesCompleted, cyclesAborted,
      numbers: null, zone: null,
    };
  }

  // WAITING
  if (spins.length < ANALYSIS_WINDOW) {
    return {
      status: 'WAITING', isActive: false,
      reason: `Acumulando datos · faltan ${ANALYSIS_WINDOW - spins.length} tiradas`,
      cyclesCompleted, cyclesAborted,
      numbers: null, zone: null,
    };
  }

  // ACTIVE mid-cycle (perdimos pasos anteriores, continuamos en el ciclo)
  if (inCycle && activeSet) {
    const prog          = VECINOS_PROGRESSION[stepIdx];
    const netProfitIfWin = 27 * prog.chipsPerNumber - cycleInvested;
    const isLastStep    = stepIdx === MAX_STEPS - 1;
    const next          = !isLastStep ? VECINOS_PROGRESSION[stepIdx + 1] : null;
    return {
      status: 'ACTIVE', isActive: true,
      reason: `Zona activa · paso ${prog.step}/${MAX_STEPS}`,
      numbers: activeNums,
      zone: activeZoneInfo,
      step: prog.step, totalSteps: MAX_STEPS,
      chipsPerNumber: prog.chipsPerNumber,
      totalChips: prog.totalChips,
      netProfitIfWin,
      cycleInvested,
      isLastStep,
      onWin:  `+${netProfitIfWin > 0 ? '' : ''}${netProfitIfWin} fichas neto → reiniciar`,
      onLoss: isLastStep
        ? `STOP — ciclo abortado · cooldown ${COOL_SPINS} tiradas`
        : `Paso ${prog.step + 1} · ${next.chipsPerNumber}f/num · ${next.totalChips}f total`,
      cyclesCompleted, cyclesAborted,
      confidence: Math.min(99, Math.round((activeZoneInfo?.zScore ?? 1) * 38)),
    };
  }

  // Sin ciclo activo: re-evaluar con datos actuales
  const freshZone = findHotZone(spins);

  // STANDBY
  if (!freshZone) {
    return {
      status: 'STANDBY', isActive: false,
      reason: `Sin zona caliente · mínimo ${MIN_ZONE_HITS} hits en últimas ${ANALYSIS_WINDOW} tiradas`,
      cyclesCompleted, cyclesAborted,
      numbers: null, zone: null,
    };
  }

  // ACTIVE (nuevo ciclo, paso 1)
  const prog0 = VECINOS_PROGRESSION[0];
  return {
    status: 'ACTIVE', isActive: true,
    reason: `Zona caliente detectada · z=${freshZone.zScore.toFixed(1)} · ${freshZone.hits}/${ANALYSIS_WINDOW} hits`,
    numbers: freshZone.numbers,
    zone: freshZone,
    step: 1, totalSteps: MAX_STEPS,
    chipsPerNumber: prog0.chipsPerNumber,
    totalChips: prog0.totalChips,
    netProfitIfWin: 27,
    cycleInvested: 0,
    isLastStep: false,
    onWin:  '+27 fichas neto → reiniciar',
    onLoss: `Paso 2 · 2f/num · 18f total`,
    cyclesCompleted, cyclesAborted,
    confidence: Math.min(99, Math.round(freshZone.zScore * 38)),
  };
}

// ─── Calcular resultado de apuesta ────────────────────────────────────────────
// profit = ganancia/pérdida de ESTA tirada (balance running acumula el P&L total)
export function calculateVecinosBetResult(state, spinNumber) {
  if (!state || !state.isActive) return null;
  const { chipsPerNumber, totalChips, step, numbers } = state;
  if (!numbers) return null;
  const isWin = numbers.includes(spinNumber);
  return {
    result:     isWin ? 'win' : 'loss',
    payout:     isWin ? 36 * chipsPerNumber : 0,
    profit:     isWin ? 27 * chipsPerNumber : -totalChips,
    chips:      totalChips,
    multiplier: step,
    systemType: 'VECINOS',
    betSectors: null,
  };
}
