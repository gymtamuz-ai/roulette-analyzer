// ═══════════════════════════════════════════════════════════════════════════════
// AXIS SIGNAL QUALITY ENGINE — Phase 4
// Mide la calidad de la señal (régimen de la mesa), no del trigger individual.
// Incluye: wheel profile, live EV, strategy ranking, performance hints,
//          table quality score.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helpers estadísticos ─────────────────────────────────────────────────────
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SIGNAL QUALITY (0–100)
//    Calidad global de la señal AXIS en esta mesa/momento.
//    Distinto de confidence (que evalúa el trigger individual).
// ═══════════════════════════════════════════════════════════════════════════════
export function computeSignalQuality(axisState, intelligence) {
  const {
    volatility        = 0.5,
    wheelBiasConfidence = { score: 0 },
    dealerSignature   = { score: 0 },
    convergence       = { score: 0 },
    antiOvertrade     = { consecutiveAborts: 0 },
  } = intelligence ?? {};

  // Factor 1: Persistencia de rueda (30%)
  const persistenceScore = wheelBiasConfidence.score;

  // Factor 2: Ruido inverso — baja volatilidad = buena señal (25%)
  const noiseScore = Math.round((1 - volatility) * 100);

  // Factor 3: Consistencia de triggers recientes en sesión (25%)
  let consistencyScore = 50; // neutral sin historial
  const { cyclesWon = 0, cyclesAborted = 0 } = axisState ?? {};
  const sessionTotal = cyclesWon + cyclesAborted;
  if (sessionTotal >= 3) {
    consistencyScore = Math.round(cyclesWon / sessionTotal * 100);
  }

  // Factor 4: Dealer signature (20%)
  const sigScore = dealerSignature.score;

  // Penalización por abortos consecutivos
  const abortPenalty = Math.min(30, (antiOvertrade.consecutiveAborts ?? 0) * 10);

  const raw = Math.round(
    persistenceScore * 0.30 +
    noiseScore       * 0.25 +
    consistencyScore * 0.25 +
    sigScore         * 0.20
  ) - abortPenalty;

  const score = Math.max(0, Math.min(100, raw));

  let label = 'Muy baja';
  if (score >= 72)      label = 'Excelente';
  else if (score >= 55) label = 'Buena';
  else if (score >= 38) label = 'Moderada';
  else if (score >= 22) label = 'Débil';

  return {
    score,
    label,
    breakdown: {
      persistence:  persistenceScore,
      noise:        noiseScore,
      consistency:  consistencyScore,
      dealerSig:    sigScore,
      abortPenalty,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. WHEEL PROFILE
//    Clasifica el régimen actual de la rueda.
// ═══════════════════════════════════════════════════════════════════════════════
const WHEEL_PROFILES = {
  chaotic:    { icon: '🌪',  color: 'text-red-400',    desc: 'Distribución caótica — sin persistencia detectable'  },
  noisy:      { icon: '📡',  color: 'text-orange-400', desc: 'Alta dispersión — señal débil'                        },
  cold:       { icon: '🧊',  color: 'text-blue-400',   desc: 'Muy pocos triggers — mesa inactiva'                  },
  stable:     { icon: '🔵',  color: 'text-blue-300',   desc: 'Distribución estable — condiciones normales'         },
  active:     { icon: '⚡',  color: 'text-yellow-400', desc: 'Múltiples sectores activos — oportunidades frecuentes'},
  clustered:  { icon: '🎯',  color: 'text-green-400',  desc: 'Clustering sostenido — firma estadística confirmada' },
  convergent: { icon: '✨',  color: 'text-purple-300', desc: 'Multi-sistema convergente — máxima señal'            },
};

export function classifyWheelProfile(intelligence, sessionTotal = 0) {
  const {
    volatility        = 0.5,
    dealerSignature   = { level: 'none' },
    wheelBiasConfidence = { level: 'none', score: 0 },
    convergence       = { score: 0 },
  } = intelligence ?? {};

  let profile = 'stable';

  if (volatility > 0.88)                                     profile = 'chaotic';
  else if (volatility > 0.72)                                profile = 'noisy';
  else if (convergence.score >= 55)                          profile = 'convergent';
  else if (dealerSignature.level === 'strong' ||
           (dealerSignature.level === 'moderate' &&
            wheelBiasConfidence.score >= 45))                profile = 'clustered';
  else if (sessionTotal >= 8 && sessionTotal > 0 &&
           sessionTotal / Math.max(1, sessionTotal) > 0.25)  profile = 'active';
  else if (sessionTotal === 0 && volatility > 0.6)           profile = 'cold';

  return { profile, ...WHEEL_PROFILES[profile] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. LIVE EV ESTIMATOR
//    Ventana rodante de las últimas N apuestas AXIS.
//    NO afirma edge matemático real; mide expectativa operativa observada.
// ═══════════════════════════════════════════════════════════════════════════════
const EV_WINDOW     = 20;
const BASELINE_EV   = -0.027; // EV teórico ruleta europea (pleno): -2.7%

export function computeLiveEV(results) {
  const axisR = results
    .filter(r => (r.system_type || r.systemType) === 'AXIS')
    .slice(-EV_WINDOW);

  if (axisR.length < 5) {
    return { ev: null, evPercent: null, evVsBaseline: null, isPositive: false, n: axisR.length, trend: 'insufficient' };
  }

  const totalProfit  = axisR.reduce((s, r) => s + (r.profit  ?? 0), 0);
  const totalWagered = axisR.reduce((s, r) => s + (r.bet_chips ?? r.chips ?? 0), 0);
  const ev = totalWagered > 0 ? totalProfit / totalWagered : 0;

  // Tendencia: comparar primera mitad vs segunda mitad
  const half   = Math.floor(axisR.length / 2);
  const evFirst  = _windowEV(axisR.slice(0, half));
  const evSecond = _windowEV(axisR.slice(half));
  const trend = evSecond > evFirst + 0.02 ? 'improving'
              : evSecond < evFirst - 0.02 ? 'declining'
              : 'stable';

  return {
    ev:           parseFloat(ev.toFixed(4)),
    evPercent:    Math.round(ev * 100),
    evVsBaseline: Math.round((ev - BASELINE_EV) * 100),
    isPositive:   ev > BASELINE_EV,
    n:            axisR.length,
    trend,
    totalProfit,
    totalWagered,
  };
}

function _windowEV(arr) {
  const profit  = arr.reduce((s, r) => s + (r.profit  ?? 0), 0);
  const wagered = arr.reduce((s, r) => s + (r.bet_chips ?? r.chips ?? 0), 0);
  return wagered > 0 ? profit / wagered : 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. STRATEGY RANKING
//    Compara AXIS, VECINOS, ESPEJO, JACOBO, A4 por ROI, winrate, estabilidad.
// ═══════════════════════════════════════════════════════════════════════════════
const SYSTEM_LABELS = {
  AXIS: '🔷 AXIS', VECINOS: '🌊 Vecinos', ESPEJO: '🪞 Espejo',
  JACOBO: '⚡ Jacobo', A4: '🎯 A4',
};

export function rankStrategies(results) {
  const systems = ['AXIS', 'VECINOS', 'ESPEJO', 'JACOBO', 'A4'];

  const ranked = systems.map(sys => {
    const sysR   = results.filter(r => (r.system_type || r.systemType) === sys);
    const total  = sysR.length;
    if (total === 0) return null;

    const wins      = sysR.filter(r => r.result === 'win').length;
    const profits   = sysR.map(r => r.profit ?? 0);
    const totalProfit = profits.reduce((s, x) => s + x, 0);
    const wagered   = sysR.reduce((s, r) => s + (r.bet_chips ?? r.chips ?? 0), 0);
    const roi       = wagered > 0 ? totalProfit / wagered : 0;

    // Sharpe-like: mean(profit) / std(profit) — consistency score
    const meanP  = totalProfit / total;
    const sd     = stdDev(profits);
    const sharpe = sd > 0 ? parseFloat((meanP / sd).toFixed(3)) : (meanP > 0 ? 99 : -99);

    // Max drawdown
    let peak = 0, dd = 0, running = 0, maxDD = 0;
    for (const p of profits) {
      running += p;
      if (running > peak) peak = running;
      dd = peak - running;
      if (dd > maxDD) maxDD = dd;
    }

    return {
      system:      sys,
      label:       SYSTEM_LABELS[sys] ?? sys,
      total,
      wins,
      winrate:     Math.round(wins / total * 100),
      totalProfit,
      roi:         Math.round(roi * 100),
      sharpe,
      maxDrawdown: maxDD,
    };
  }).filter(Boolean);

  // Sort: positive ROI first, then by sharpe (consistency)
  ranked.sort((a, b) => {
    if (a.roi !== b.roi) return b.roi - a.roi;
    return b.sharpe - a.sharpe;
  });

  return ranked;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TABLE QUALITY SCORE
//    Evalúa la calidad de esta mesa para jugar AXIS.
// ═══════════════════════════════════════════════════════════════════════════════
export function computeTableQualityScore(memoryRows, intelligence) {
  let score  = 50; // base neutral
  const tags = [];

  // A) Historial de memoria (sector performance)
  if (memoryRows && memoryRows.length > 0) {
    const qualified = memoryRows.filter(r => r.total_cycles >= 5);
    if (qualified.length > 0) {
      const avgWinrate = qualified.reduce((s, r) => s + r.wins / r.total_cycles, 0) / qualified.length;
      const memScore   = Math.round(avgWinrate * 100);
      score += (memScore - 50) * 0.4; // contribución: ±20 pts
      if (avgWinrate > 0.5) tags.push('Sectores históricamente rentables');
      else if (avgWinrate < 0.35) tags.push('Sectores históricamente pobres');
    }

    // Eclipse recurrence
    const eclipses = memoryRows.filter(r => r.sector_type === 'E' && r.total_cycles >= 2);
    if (eclipses.length >= 2) { score += 10; tags.push(`${eclipses.length} eclipses recurrentes`); }
  }

  // B) Wheel bias (señal estadística de esta rueda)
  const bias = intelligence?.wheelBiasConfidence;
  if (bias) {
    if (bias.level === 'strong')   { score += 20; tags.push('Sesgo de rueda fuerte'); }
    if (bias.level === 'moderate') { score += 10; tags.push('Sesgo de rueda moderado'); }
    if (bias.level === 'none')     { score -= 5; }
  }

  // C) Dealer signature
  const dealer = intelligence?.dealerSignature;
  if (dealer?.level === 'strong')   { score += 15; tags.push('Firma de distribución fuerte'); }
  if (dealer?.level === 'moderate') { score += 8; }

  // D) Volatility penalty
  const vol = intelligence?.volatility ?? 0.5;
  if (vol > 0.8) { score -= 20; tags.push('Mesa muy volátil'); }
  if (vol > 0.6) score -= 10;

  score = Math.round(Math.max(0, Math.min(100, score)));

  let grade = 'C';
  if (score >= 80) grade = 'A+';
  else if (score >= 70) grade = 'A';
  else if (score >= 60) grade = 'B';
  else if (score >= 45) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';

  return { score, grade, tags };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PERFORMANCE OPTIMIZER (hints)
//    Detecta problemas operativos y sugiere ajustes.
//    Solo sugiere — NO modifica nada automáticamente.
// ═══════════════════════════════════════════════════════════════════════════════
export function detectPerformanceIssues(axisState, results, intelligence, memoryRows = []) {
  const issues      = [];
  const suggestions = [];
  const log         = [];

  const axisR = results.filter(r => (r.system_type || r.systemType) === 'AXIS');
  const total  = axisR.length;
  const wins   = axisR.filter(r => r.result === 'win').length;

  // Issue 1: Low overall winrate
  if (total >= 8 && wins / total < 0.30) {
    issues.push('Winrate global < 30%');
    suggestions.push('Activar filtro de convergencia mínima (≥35 pts) antes de entrar');
    log.push('[AXIS PRO] Weak triggers — convergence gate recommended');
  }

  // Issue 2: Consecutive aborts
  const consecAborts = intelligence?.antiOvertrade?.consecutiveAborts ?? 0;
  if (consecAborts >= 2) {
    issues.push(`${consecAborts} abortos consecutivos`);
    suggestions.push('Esperar dealer signature ≥ weak antes del próximo trigger');
    log.push('[AXIS PRO] Consecutive aborts — delay entry recommended');
  }

  // Issue 3: High volatility
  if ((intelligence?.volatility ?? 0.5) > 0.75) {
    issues.push('Volatilidad elevada');
    suggestions.push('Requerir trigger primario (2/3), filtrar secundarios (3/6)');
    log.push('[AXIS PRO] High volatility — primary trigger only');
  }

  // Issue 4: Cold sectors dominating memory
  const coldRows = memoryRows.filter(r =>
    r.total_cycles >= 6 && (r.total_cycles - r.wins) / r.total_cycles > 0.65
  );
  if (coldRows.length >= 3) {
    issues.push(`${coldRows.length} sectores históricos COLD`);
    suggestions.push('Evitar sectores COLD históricamente — esperar reclasificación HOT');
    log.push(`[AXIS PRO] ${coldRows.length} cold sectors in memory`);
  }

  // Issue 5: Eclipse underperforming
  const eclipseR = axisR.filter(r => {
    // detect eclipse from bet chips count (4-5 numbers vs 6)
    return (r.bet_chips ?? 0) < 6;
  });
  if (eclipseR.length >= 4) {
    const eclipseWins = eclipseR.filter(r => r.result === 'win').length;
    if (eclipseWins / eclipseR.length < 0.25) {
      issues.push('Eclipses con bajo rendimiento');
      suggestions.push('Eclipse puede estar en fase divergente — reducir stake eclipse');
      log.push('[AXIS PRO] Eclipse underperforming this session');
    }
  }

  // Issue 6: Overtrading (too many triggers in session)
  const cyclesTotal = (axisState?.cyclesWon ?? 0) + (axisState?.cyclesAborted ?? 0);
  const totalSpins  = axisR.length > 0 ? Math.max(...axisR.map((r, i) => i)) + 1 : 0;
  if (cyclesTotal > 0 && totalSpins > 10 && cyclesTotal / totalSpins > 0.35) {
    issues.push('Frecuencia de trigger alta — posible sobreoperación');
    suggestions.push('Aumentar threshold: exigir convergencia ≥2 sistemas para entrar');
    log.push('[AXIS PRO] Overtrade detected — trigger threshold too permissive');
  }

  return { issues, suggestions, log };
}
