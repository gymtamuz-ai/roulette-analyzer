import { useMemo } from 'react';
import { VECINOS_PROGRESSION, ZONE_RADIUS, ANALYSIS_WINDOW, MIN_ZONE_HITS, MAX_STEPS, MIN_QUALITY } from '../utils/vecinos';
import { computeConvergentZone } from '../utils/vecinosHistory';
import { RED_NUMBERS } from '../utils/roulette';

// ─── Sub-components ────────────────────────────────────────────────────────────
function NumChip({ n, highlight = false }) {
  const base = n === 0
    ? 'bg-green-800 text-green-200 border-green-600'
    : RED_NUMBERS.has(n)
      ? 'bg-red-800 text-red-100 border-red-600'
      : 'bg-gray-600 text-gray-100 border-gray-500';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition-all
      ${base} ${highlight ? 'ring-2 ring-green-400 scale-110' : ''}`}>
      {n}
    </span>
  );
}

function ConfidenceBar({ value, color = 'bg-green-500' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{value}%</span>
    </div>
  );
}

// ─── Quality ring ─────────────────────────────────────────────────────────────
function QualityBadge({ quality }) {
  const color = quality >= 60
    ? 'text-green-400 border-green-600'
    : quality >= 40
      ? 'text-yellow-400 border-yellow-700'
      : 'text-orange-400 border-orange-700';
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
      <span>⬟</span>
      <span>Calidad {quality}/100</span>
    </div>
  );
}

// ─── Convergence badge ────────────────────────────────────────────────────────
function ConvergenceBadge({ state, hasEnoughHistory, totalHistoricalSpins }) {
  if (!hasEnoughHistory) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs border-gray-700 text-gray-500">
        ⏳ Sin hist. suficiente ({totalHistoricalSpins}/150 spins)
      </div>
    );
  }
  const cfg = {
    CONVERGENTE: { cls: 'border-green-600 bg-green-900/20 text-green-400', icon: '✓', label: 'CONFIRMADO POR HISTORIAL' },
    LOCAL:       { cls: 'border-blue-700 bg-blue-900/10 text-blue-400',    icon: '📍', label: 'SOLO SESIÓN ACTUAL' },
    HISTÓRICO:   { cls: 'border-yellow-700 bg-yellow-900/10 text-yellow-400', icon: '📊', label: 'HISTORIAL SÍ · LOCAL AÚN NO' },
    DIVERGENTE:  { cls: 'border-red-700 bg-red-900/10 text-red-400',       icon: '⚠', label: 'DIVERGENTE CON HISTORIAL' },
    NEUTRAL:     { cls: 'border-gray-700 bg-gray-800/40 text-gray-500',    icon: '〰', label: 'SIN SEÑAL' },
  }[state] ?? { cls: 'border-gray-700 text-gray-500', icon: '?', label: state };

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${cfg.cls}`}>
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </div>
  );
}

// ─── Z-score display (local + historical) ─────────────────────────────────────
function ZScoreRow({ localZ, historicalZ, hasEnoughHistory }) {
  const localColor = localZ >= 2.0 ? 'text-green-400' : localZ >= 1.63 ? 'text-yellow-400' : 'text-gray-500';
  const histColor  = historicalZ >= 1.5 ? 'text-green-400' : historicalZ >= 1.0 ? 'text-yellow-400' : 'text-gray-500';

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="bg-gray-800 rounded-lg p-2 text-center">
        <div className="text-gray-500 mb-0.5">Z local (sesión)</div>
        <div className={`font-black text-lg ${localColor}`}>
          {localZ > 0 ? '+' : ''}{localZ.toFixed(2)}σ
        </div>
        <div className="text-gray-600" style={{ fontSize: 9 }}>umbral ≥1.63</div>
      </div>
      <div className="bg-gray-800 rounded-lg p-2 text-center">
        <div className="text-gray-500 mb-0.5">Z histórico</div>
        {hasEnoughHistory ? (
          <>
            <div className={`font-black text-lg ${histColor}`}>
              {historicalZ > 0 ? '+' : ''}{historicalZ.toFixed(2)}σ
            </div>
            <div className="text-gray-600" style={{ fontSize: 9 }}>umbral ≥1.0</div>
          </>
        ) : (
          <div className="text-gray-600 text-xs mt-1">—</div>
        )}
      </div>
    </div>
  );
}

// ─── Flat / Progressive toggle ────────────────────────────────────────────────
function BettingTypeToggle({ bettingType, onBettingTypeChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 shrink-0">Modo apuesta:</span>
      <div className="flex gap-0.5 flex-1">
        <button
          onClick={() => onBettingTypeChange?.('progressive')}
          className={`flex-1 py-1 text-xs font-bold rounded border transition-all ${
            bettingType === 'progressive'
              ? 'bg-orange-700 text-white border-orange-500'
              : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
          }`}
        >
          📈 Progresivo
        </button>
        <button
          onClick={() => onBettingTypeChange?.('flat')}
          className={`flex-1 py-1 text-xs font-bold rounded border transition-all ${
            bettingType === 'flat'
              ? 'bg-blue-700 text-white border-blue-500'
              : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
          }`}
        >
          ➡ Plano
        </button>
      </div>
    </div>
  );
}

// ─── Flat mode info ───────────────────────────────────────────────────────────
function FlatModeInfo() {
  return (
    <div className="bg-blue-900/10 border border-blue-800 rounded-lg p-2.5 text-xs flex flex-col gap-1">
      <div className="text-blue-400 font-bold">Modo Plano — 1f por número · 9f total</div>
      <div className="text-gray-500">
        Sin progresión — cada tirada es independiente
      </div>
      <div className="text-gray-600 border-t border-blue-900 pt-1 mt-0.5">
        EV teórico: (9/37)×27 − (28/37)×9 = <span className="text-red-400 font-bold">−0.24f</span> por apuesta
        <br />
        Equivale a la ventaja de la casa (−2.7%). Edge positivo solo si la rueda tiene sesgo físico.
      </div>
    </div>
  );
}

// ─── Analytics row ────────────────────────────────────────────────────────────
function AnalyticsRow({ analytics, zone }) {
  if (!analytics || !zone) return null;
  const { persistence, stability, decayZ, antiSpike, breakdown } = analytics;

  return (
    <div className="bg-gray-800/60 rounded-lg p-2.5 flex flex-col gap-1.5">
      <div className="text-xs text-gray-500 mb-0.5 flex items-center justify-between">
        <span>Análisis estadístico</span>
        {antiSpike && <span className="text-orange-400 text-xs">⚡ Anti-spike activo</span>}
      </div>

      {/* Persistence */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 w-24">Persistencia</span>
        <div className="flex-1 mx-2">
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${persistence * 100}%` }} />
          </div>
        </div>
        <span className="text-blue-400 font-bold w-10 text-right">{(persistence * 100).toFixed(0)}%</span>
      </div>

      {/* Stability */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 w-24">Estabilidad</span>
        <div className="flex-1 mx-2">
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${stability * 100}%` }} />
          </div>
        </div>
        <span className="text-purple-400 font-bold w-10 text-right">{(stability * 100).toFixed(0)}%</span>
      </div>

      {/* Decay Z */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 w-24">Z decay</span>
        <div className="flex-1 mx-2" />
        <span className={`font-bold w-10 text-right ${decayZ >= 1.0 ? 'text-green-400' : decayZ >= 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
          {decayZ >= 0 ? '+' : ''}{decayZ.toFixed(2)}σ
        </span>
      </div>

      {/* Score breakdown */}
      {breakdown && (
        <div className="text-xs text-gray-600 pt-1 border-t border-gray-700">
          base {breakdown.baseScore} + pers {breakdown.persistBonus} + estab {breakdown.stabilBonus}
          {breakdown.decayBonus > 0 ? ` + decay ${breakdown.decayBonus}` : ''}
          {breakdown.spikePenalty ? ` − spike ${Math.abs(breakdown.spikePenalty)}` : ''}
        </div>
      )}
    </div>
  );
}

// ─── Status header ─────────────────────────────────────────────────────────────
function StatusHeader({ status, reason, confidence }) {
  const cfg = {
    ACTIVE: {
      border: 'border-green-500', bg: 'bg-green-900/20',
      icon: '⚡', label: 'VECINOS · ACTIVO', color: 'text-green-400',
    },
    STANDBY: {
      border: 'border-gray-600', bg: 'bg-gray-800/40',
      icon: '🔍', label: 'VECINOS · BUSCANDO', color: 'text-gray-400',
    },
    COOLING: {
      border: 'border-orange-700', bg: 'bg-orange-900/20',
      icon: '🌡', label: 'VECINOS · COOLDOWN', color: 'text-orange-400',
    },
    WAITING: {
      border: 'border-gray-700', bg: 'bg-gray-800/30',
      icon: '⏳', label: 'VECINOS · ESPERANDO', color: 'text-gray-500',
    },
  }[status] ?? { border: 'border-gray-700', bg: 'bg-gray-800', icon: '⏳', label: 'VECINOS', color: 'text-gray-400' };

  return (
    <div className={`rounded-xl p-3 border-2 ${cfg.border} ${cfg.bg}`}>
      <div className={`text-base font-black tracking-wider mb-1 ${cfg.color}`}>
        {cfg.icon} {cfg.label}
      </div>
      <div className="text-gray-400 text-xs mb-2">{reason}</div>
      {status === 'ACTIVE' && confidence > 0 && (
        <ConfidenceBar value={confidence} color={confidence >= 60 ? 'bg-green-500' : 'bg-yellow-500'} />
      )}
    </div>
  );
}

// ─── Progression bar ──────────────────────────────────────────────────────────
function StepBar({ currentStep, isActive }) {
  const cumulativeLoss = [0, 9, 27, 54, 90];
  return (
    <div className="flex gap-0.5">
      {VECINOS_PROGRESSION.map(({ step, chipsPerNumber, totalChips }) => {
        const netAcum   = 27 * chipsPerNumber - cumulativeLoss[step - 1];
        const isPast    = isActive && step < currentStep;
        const isCurrent = isActive && step === currentStep;
        return (
          <div key={step} className={`flex-1 text-center rounded p-1 text-xs font-bold transition-all
            ${isPast    ? 'bg-red-900/50 text-red-400'
              : isCurrent ? 'bg-green-700 border border-green-400 text-white'
              : 'bg-gray-800 text-gray-600'}`}>
            <div>{step}</div>
            <div className="font-normal opacity-70">{chipsPerNumber}f</div>
            <div className={`text-xs ${isPast ? 'text-red-500' : netAcum > 0 ? 'text-green-600' : 'text-gray-600'}`}>
              {isPast ? '✗' : `+${netAcum}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Zone stats ───────────────────────────────────────────────────────────────
function ZoneStats({ zone }) {
  if (!zone) return null;
  const { hits, expected, zScore } = zone;
  const zColor = zScore >= 2.0 ? 'text-green-400' : zScore >= 1.65 ? 'text-yellow-400' : 'text-orange-400';
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-xs">
      <div className="bg-gray-800 rounded-lg p-2">
        <div className="text-gray-500">Hits zona</div>
        <div className="font-black text-green-400 text-lg">{hits}<span className="text-gray-500 text-xs font-normal">/{ANALYSIS_WINDOW}</span></div>
      </div>
      <div className="bg-gray-800 rounded-lg p-2">
        <div className="text-gray-500">Esperados</div>
        <div className="font-black text-gray-300 text-lg">{expected}</div>
      </div>
      <div className="bg-gray-800 rounded-lg p-2">
        <div className="text-gray-500">Z-score</div>
        <div className={`font-black text-lg ${zColor}`}>{zScore.toFixed(1)}σ</div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function VecinosPanel({
  state,
  historicalBlocks = [],
  bettingType = 'progressive',
  onBettingTypeChange,
}) {
  // Compute convergence (local spins not directly available, we use state.zone for display)
  // Note: historicalBlocks is passed directly; local spins are available via state
  // We reconstruct a minimal spin list from the local zone to compute convergence display
  // Actually: App.jsx passes `spins` only via `vecinosState`, not directly.
  // To avoid prop-drilling spins, we compute convergence only when state has zone data.
  // The real convergence computation (with findHotZone) is in autoSystem.js.
  // Here we just show the result from a lightweight re-computation via the state.

  // We receive historicalBlocks but need localSpins for computeConvergentZone.
  // Since VecinosPanel doesn't receive raw spins, we compute a simplified display:
  // if state has a zone, we show historical z-score separately.
  const { posFreq, totalWeightedSpins, totalBlocks } = useMemo(
    () => {
      if (!historicalBlocks || historicalBlocks.length === 0) {
        return { posFreq: null, totalWeightedSpins: 0, totalBlocks: 0 };
      }
      // Inline the freq computation to avoid importing the full module every render
      const WHEEL_ORDER_LOCAL = [
        0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
        8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
        28, 12, 35, 3, 26,
      ];
      const WIDX = {};
      WHEEL_ORDER_LOCAL.forEach((n, i) => { WIDX[n] = i; });
      const N_LOCAL = 37;
      const HALF_LIFE = 10;
      const pf = new Array(N_LOCAL).fill(0);
      let tws = 0;
      const tb = historicalBlocks.length;
      historicalBlocks.forEach((block, i) => {
        const age = tb - 1 - i;
        const w = Math.pow(0.5, age / HALF_LIFE);
        tws += 36 * w;
        if (block.numbers) {
          for (const { num, count } of block.numbers) {
            const pos = WIDX[num];
            if (pos !== undefined) pf[pos] += count * w;
          }
        }
      });
      return { posFreq: pf, totalWeightedSpins: tws, totalBlocks: tb };
    },
    [historicalBlocks],
  );

  // Compute historical zone from freq (for z-score display)
  const historicalZone = useMemo(() => {
    if (!posFreq || totalWeightedSpins < 150) return null;
    const p = 9 / 37;
    const expected = totalWeightedSpins * p;
    const sigma = Math.sqrt(totalWeightedSpins * p * (1 - p));
    if (sigma <= 0) return null;
    let bestCenter = 0, bestHits = 0;
    for (let center = 0; center < 37; center++) {
      let hits = 0;
      for (let d = -4; d <= 4; d++) hits += posFreq[(center + d + 37) % 37];
      if (hits > bestHits) { bestHits = hits; bestCenter = center; }
    }
    const z = (bestHits - expected) / sigma;
    if (z < 1.0) return null;
    return { zScore: parseFloat(z.toFixed(2)), center: bestCenter };
  }, [posFreq, totalWeightedSpins]);

  // Convergence state (simplified — based on zone overlap)
  const convergenceState = useMemo(() => {
    if (totalWeightedSpins < 150) return 'NEUTRAL';  // not enough history
    if (!state?.zone) return historicalZone ? 'HISTÓRICO' : 'NEUTRAL';
    if (!historicalZone) return 'LOCAL';
    // Check center proximity (within 4 positions)
    const WHEEL_ORDER_LOCAL = [
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
      8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
      28, 12, 35, 3, 26,
    ];
    const localCenterPos = WHEEL_ORDER_LOCAL.indexOf(state.zone.center);
    const histCenterPos  = historicalZone.center;
    const dist = Math.min(
      Math.abs(localCenterPos - histCenterPos),
      37 - Math.abs(localCenterPos - histCenterPos),
    );
    return dist <= 4 ? 'CONVERGENTE' : 'DIVERGENTE';
  }, [state?.zone, historicalZone, totalWeightedSpins]);

  const hasEnoughHistory    = totalWeightedSpins >= 150;
  const totalHistoricalSpins = Math.round(totalBlocks * 36);

  if (!state) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 text-center">
        <div className="text-4xl mb-2">🌊</div>
        <div className="text-gray-400 text-sm">Sin datos</div>
      </div>
    );
  }

  const {
    status = 'WAITING',
    reason = '',
    isActive,
    numbers,
    zone,
    analytics,
    step = 1, totalSteps = MAX_STEPS,
    chipsPerNumber = 1, totalChips = 9,
    netProfitIfWin = 27, cycleInvested = 0,
    isLastStep = false,
    onWin, onLoss,
    spinsRemaining,
    cyclesCompleted = 0, cyclesAborted = 0,
    confidence = 0,
  } = state;

  const localZ    = zone?.zScore ?? 0;
  const histZ     = historicalZone?.zScore ?? 0;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Status header ── */}
      <StatusHeader status={status} reason={reason} confidence={confidence} />

      {/* ── Flat / Progressive toggle (always shown) ── */}
      <BettingTypeToggle bettingType={bettingType} onBettingTypeChange={onBettingTypeChange} />

      {/* ── Flat mode info ── */}
      {bettingType === 'flat' && <FlatModeInfo />}

      {/* ── Quality badge + anti-spike (when zone detected) ── */}
      {analytics && (
        <div className="flex items-center justify-between flex-wrap gap-1">
          <QualityBadge quality={analytics.quality} />
          {analytics.antiSpike && (
            <span className="text-xs text-orange-400 border border-orange-800 rounded-full px-2 py-0.5">
              ⚡ Anti-spike (z&gt;3.5)
            </span>
          )}
        </div>
      )}

      {/* ── Convergence badge (always shown when zone or history present) ── */}
      {(zone || hasEnoughHistory) && (
        <div className="flex flex-col gap-1">
          <ConvergenceBadge
            state={convergenceState}
            hasEnoughHistory={hasEnoughHistory}
            totalHistoricalSpins={totalHistoricalSpins}
          />
          {convergenceState === 'DIVERGENTE' && (
            <div className="text-xs text-red-400 bg-red-900/10 border border-red-900 rounded px-2 py-1">
              ⚠ La señal local y el historial de esta mesa apuntan a zonas distintas del cilindro.
              Precaución adicional recomendada.
            </div>
          )}
        </div>
      )}

      {/* ── Z-score comparison (local + historical) ── */}
      {zone && (
        <ZScoreRow
          localZ={localZ}
          historicalZ={histZ}
          hasEnoughHistory={hasEnoughHistory}
        />
      )}

      {/* ── COOLING info ── */}
      {status === 'COOLING' && spinsRemaining > 0 && (
        <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-3 text-center">
          <div className="text-orange-400 font-bold text-sm">🌡 Pausa de protección</div>
          <div className="text-gray-400 text-xs mt-1">
            Reactivación en <span className="text-orange-300 font-bold">{spinsRemaining}</span> tirada{spinsRemaining !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ── Zone stats (raw hits) ── */}
      {zone && <ZoneStats zone={zone} />}

      {/* ── Analytics breakdown ── */}
      {analytics && <AnalyticsRow analytics={analytics} zone={zone} />}

      {/* ── Numbers in wheel order ── */}
      {numbers && (
        <div>
          <div className="text-xs text-gray-500 mb-2">
            9 plenos · cilindro · centro: <span className="text-green-400 font-bold">{zone?.center ?? '?'}</span>
            {!isActive && (
              <span className="ml-2 text-yellow-600">
                {status === 'STANDBY' && analytics?.quality < MIN_QUALITY ? '(calidad insuficiente)' : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {numbers.map(n => (
              <NumChip key={n} n={n} highlight={n === zone?.center} />
            ))}
          </div>
          <div className="text-xs text-gray-600 mt-1.5">
            ±{ZONE_RADIUS} posiciones en el cilindro · {numbers.length} números contiguos
          </div>
        </div>
      )}

      {/* ── Bet stats (only when actively betting) ── */}
      {isActive && bettingType === 'progressive' && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500">Paso</div>
              <div className="font-black text-green-400 text-xl">{step}/{totalSteps}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500">Por número</div>
              <div className="font-black text-white text-xl">{chipsPerNumber}f</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500">Total apuesta</div>
              <div className="font-black text-orange-400 text-xl">{totalChips}f</div>
            </div>
          </div>

          <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
            <div className="text-xs text-gray-400 mb-1">Ganancia neta si acierta ahora</div>
            <div className={`text-2xl font-black ${netProfitIfWin > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {netProfitIfWin > 0 ? '+' : ''}{netProfitIfWin} fichas
            </div>
            {cycleInvested > 0 && (
              <div className="text-xs text-gray-500 mt-0.5">Invertido en ciclo: {cycleInvested}f</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg p-2 border border-green-700 bg-green-900/10">
              <div className="text-green-400 font-semibold mb-1">Si ACIERTA →</div>
              <div className="text-gray-300">{onWin}</div>
            </div>
            <div className={`rounded-lg p-2 border ${isLastStep ? 'border-red-700 bg-red-900/20' : 'border-gray-700 bg-gray-800'}`}>
              <div className="text-red-400 font-semibold mb-1">Si FALLA →</div>
              {onLoss?.startsWith('STOP')
                ? <div className="text-red-300 font-bold">⛔ {onLoss}</div>
                : <div className="text-gray-300">{onLoss}</div>}
            </div>
          </div>
        </>
      )}

      {/* ── Flat mode active bet info ── */}
      {isActive && bettingType === 'flat' && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-gray-500">Apuesta</div>
            <div className="font-black text-blue-400 text-xl">9f</div>
            <div className="text-gray-600">1f × 9 nums</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-gray-500">Si acierta</div>
            <div className="font-black text-green-400 text-xl">+27f</div>
            <div className="text-gray-600">neto</div>
          </div>
        </div>
      )}

      {/* ── Progression bar (progressive mode only) ── */}
      {bettingType === 'progressive' && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5">Progresión ({MAX_STEPS} pasos · pérd. máx. 144f):</div>
          <StepBar currentStep={step} isActive={isActive} />
          <div className="text-xs text-gray-700 mt-1 text-center">
            chips/núm · ganancia neta acumulada si acierta en ese paso
          </div>
        </div>
      )}

      {/* ── How it works (when not active) ── */}
      {!isActive && status !== 'COOLING' && (
        <div className="bg-gray-800/40 rounded-lg p-2.5 text-xs text-gray-500 flex flex-col gap-0.5">
          <div className="font-semibold text-gray-400 mb-1">Criterios de activación:</div>
          <div>• Z-score local ≥ 1.63 (p &lt; 0.10) en ventana de {ANALYSIS_WINDOW} tiradas</div>
          <div>• Z-score ≤ 3.5 (anti-spike — picos extremos revierten a la media)</div>
          <div>• Calidad mínima {MIN_QUALITY}/100 (z + persistencia + estabilidad)</div>
          <div>• Cobertura: 9/37 = <strong className="text-gray-300">24.3%</strong> por tirada</div>
          {hasEnoughHistory && (
            <div>• Señal histórica (z ≥ 1.0) confirma zona → bonus de convergencia</div>
          )}
        </div>
      )}

      {/* ── Counters ── */}
      <div className="flex gap-3 text-xs text-gray-500 border-t border-gray-800 pt-2 flex-wrap">
        <span>✅ Ciclos: <span className="text-green-400 font-bold">{cyclesCompleted}</span></span>
        <span>⛔ Abortados: <span className="text-red-400 font-bold">{cyclesAborted}</span></span>
        {hasEnoughHistory && (
          <span>📊 Hist: <span className="text-blue-400 font-bold">{totalHistoricalSpins}</span> spins</span>
        )}
        <span className="ml-auto text-gray-600">vent.{ANALYSIS_WINDOW}·±{ZONE_RADIUS}·min{MIN_ZONE_HITS}h</span>
      </div>
    </div>
  );
}
