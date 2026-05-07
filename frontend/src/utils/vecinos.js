// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA VECINOS — v2 (Enhanced)
// Ventana deslizante de densidad sobre el cilindro físico europeo.
// Fase 2: umbral z≥1.65, persistencia obligatoria, anti-spike, quality gate.
// ═══════════════════════════════════════════════════════════════════════════════

import { computeZoneQuality } from './vecinosAnalytics';

// Orden físico del cilindro europeo
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];
const N = WHEEL_ORDER.length;

const WHEEL_INDEX = {};
for (let i = 0; i < N; i++) WHEEL_INDEX[WHEEL_ORDER[i]] = i;

// ─── Parámetros ───────────────────────────────────────────────────────────────
export const ZONE_RADIUS      = 4;   // ±4 = 9 posiciones continuas
export const ANALYSIS_WINDOW  = 20;  // ventana principal de detección
export const MIN_ZONE_HITS    = 8;   // z ≈ 1.63 (p < 0.10) — subido de 7
export const MIN_QUALITY      = 30;  // quality gate antes de activar ciclo
export const COOL_SPINS       = 10;  // tiradas de pausa tras ciclo fallido
export const MAX_STEPS        = 5;   // pasos máximos antes de abortar ciclo
export const ANTI_SPIKE_Z     = 3.5; // z excesivo = no entrar (revertirá a la media)

// ─── Progresión (recovery-positive) ──────────────────────────────────────────
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
  const freq   = new Array(N).fill(0);
  for (const s of recent) {
    const pos = WHEEL_INDEX[s.number];
    if (pos !== undefined) freq[pos]++;
  }

  let bestCenter = 0, bestHits = 0;
  for (let center = 0; center < N; center++) {
    let hits = 0;
    for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
      hits += freq[(center + d + N) % N];
    }
    if (hits > bestHits) { bestHits = hits; bestCenter = center; }
  }

  if (bestHits < MIN_ZONE_HITS) return null;

  // Anti-spike: z demasiado alto tiende a revertir
  const p        = (2 * ZONE_RADIUS + 1) / N;
  const expected = ANALYSIS_WINDOW * p;
  const sigma    = Math.sqrt(ANALYSIS_WINDOW * p * (1 - p));
  const zScore   = sigma > 0 ? (bestHits - expected) / sigma : 0;

  if (zScore > ANTI_SPIKE_Z) return null; // no entrar en picos extremos

  const numbers = [];
  for (let d = -ZONE_RADIUS; d <= ZONE_RADIUS; d++) {
    numbers.push(WHEEL_ORDER[(bestCenter + d + N) % N]);
  }

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
  let cycleInvested  = 0;
  let blockedUntil   = -1;
  let inCycle        = false;
  let activeSet      = null;
  let activeNums     = null;
  let activeZoneInfo = null;
  let activeQuality  = null;
  let cyclesCompleted = 0;
  let cyclesAborted   = 0;

  for (let i = 0; i < spins.length; i++) {
    if (i <= blockedUntil) continue;
    if (i < ANALYSIS_WINDOW) continue;

    const prevSpins = spins.slice(0, i);

    if (!inCycle) {
      const zone = findHotZone(prevSpins);
      if (!zone) continue;

      // Quality gate: exigir calidad mínima antes de activar el ciclo
      const qa = computeZoneQuality(prevSpins, zone);
      if (qa.quality < MIN_QUALITY) continue;  // señal insuficiente

      inCycle        = true;
      stepIdx        = 0;
      cycleInvested  = 0;
      activeSet      = new Set(zone.numbers);
      activeNums     = zone.numbers;
      activeZoneInfo = zone;
      activeQuality  = qa;
    }

    const isWin = activeSet.has(spins[i].number);

    if (isWin) {
      cyclesCompleted++;
      inCycle        = false;
      activeSet      = null;
      activeNums     = null;
      activeZoneInfo = null;
      activeQuality  = null;
      stepIdx        = 0;
      cycleInvested  = 0;
    } else {
      cycleInvested += VECINOS_PROGRESSION[stepIdx].totalChips;
      if (stepIdx >= MAX_STEPS - 1) {
        cyclesAborted++;
        inCycle        = false;
        activeSet      = null;
        activeNums     = null;
        activeZoneInfo = null;
        activeQuality  = null;
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
      numbers: null, zone: null, analytics: null,
    };
  }

  // WAITING
  if (spins.length < ANALYSIS_WINDOW) {
    return {
      status: 'WAITING', isActive: false,
      reason: `Acumulando datos · faltan ${ANALYSIS_WINDOW - spins.length} tiradas`,
      cyclesCompleted, cyclesAborted,
      numbers: null, zone: null, analytics: null,
    };
  }

  // ACTIVE mid-cycle (perdimos pasos anteriores)
  if (inCycle && activeSet) {
    const prog           = VECINOS_PROGRESSION[stepIdx];
    const netProfitIfWin = 27 * prog.chipsPerNumber - cycleInvested;
    const isLastStep     = stepIdx === MAX_STEPS - 1;
    const next           = !isLastStep ? VECINOS_PROGRESSION[stepIdx + 1] : null;
    return {
      status: 'ACTIVE', isActive: true,
      reason: `Zona activa · paso ${prog.step}/${MAX_STEPS}`,
      numbers: activeNums,
      zone: activeZoneInfo,
      analytics: activeQuality,
      step: prog.step, totalSteps: MAX_STEPS,
      chipsPerNumber: prog.chipsPerNumber,
      totalChips: prog.totalChips,
      netProfitIfWin,
      cycleInvested,
      isLastStep,
      onWin:  `+${netProfitIfWin} fichas neto → reiniciar`,
      onLoss: isLastStep
        ? `STOP — ciclo abortado · cooldown ${COOL_SPINS} tiradas`
        : `Paso ${prog.step + 1} · ${next.chipsPerNumber}f/num · ${next.totalChips}f total`,
      cyclesCompleted, cyclesAborted,
      confidence: Math.min(99, Math.round((activeZoneInfo?.zScore ?? 1) * 38)),
    };
  }

  // Re-evaluar con datos actuales
  const freshZone = findHotZone(spins);

  // STANDBY: sin zona
  if (!freshZone) {
    return {
      status: 'STANDBY', isActive: false,
      reason: `Sin zona caliente · mínimo ${MIN_ZONE_HITS} hits en últimas ${ANALYSIS_WINDOW} (z≥1.63 · sin anti-spike)`,
      cyclesCompleted, cyclesAborted,
      numbers: null, zone: null, analytics: null,
    };
  }

  // Calcular calidad de la zona fresca
  const freshQuality = computeZoneQuality(spins, freshZone);

  // STANDBY: zona detectada pero calidad insuficiente
  if (freshQuality.quality < MIN_QUALITY) {
    return {
      status: 'STANDBY', isActive: false,
      reason: `Zona detectada (z=${freshZone.zScore.toFixed(1)}) · calidad insuficiente (${freshQuality.quality}/100)`,
      zone: freshZone,
      analytics: freshQuality,
      cyclesCompleted, cyclesAborted,
      numbers: freshZone.numbers, // mostrar en UI aunque no estemos activos
    };
  }

  // ACTIVE nuevo ciclo (paso 1)
  const prog0 = VECINOS_PROGRESSION[0];
  return {
    status: 'ACTIVE', isActive: true,
    reason: `Zona caliente detectada · z=${freshZone.zScore.toFixed(1)} · calidad ${freshQuality.quality}/100`,
    numbers: freshZone.numbers,
    zone: freshZone,
    analytics: freshQuality,
    step: 1, totalSteps: MAX_STEPS,
    chipsPerNumber: prog0.chipsPerNumber,
    totalChips: prog0.totalChips,
    netProfitIfWin: 27,
    cycleInvested: 0,
    isLastStep: false,
    onWin:  '+27 fichas neto → reiniciar',
    onLoss: 'Paso 2 · 2f/num · 18f total',
    cyclesCompleted, cyclesAborted,
    confidence: Math.min(99, Math.round(freshZone.zScore * 38)),
  };
}

// ─── Calcular resultado de apuesta ────────────────────────────────────────────
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
