import { VECINOS_PROGRESSION, ZONE_RADIUS, ANALYSIS_WINDOW, MIN_ZONE_HITS, MAX_STEPS, MIN_QUALITY } from '../utils/vecinos';
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
  const color = quality >= 60 ? 'text-green-400 border-green-600' : quality >= 40 ? 'text-yellow-400 border-yellow-700' : 'text-orange-400 border-orange-700';
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
      <span>⬟</span>
      <span>Calidad {quality}/100</span>
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
export default function VecinosPanel({ state }) {
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

  return (
    <div className="flex flex-col gap-3">

      {/* ── Status header ── */}
      <StatusHeader status={status} reason={reason} confidence={confidence} />

      {/* ── Quality badge (when zone detected, active or not) ── */}
      {analytics && (
        <div className="flex items-center justify-between">
          <QualityBadge quality={analytics.quality} />
          {analytics.antiSpike && (
            <span className="text-xs text-orange-400 border border-orange-800 rounded-full px-2 py-0.5">
              ⚡ Anti-spike (z&gt;3.5)
            </span>
          )}
        </div>
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

      {/* ── Zone stats ── */}
      {zone && <ZoneStats zone={zone} />}

      {/* ── Analytics breakdown ── */}
      {analytics && <AnalyticsRow analytics={analytics} zone={zone} />}

      {/* ── Numbers in wheel order ── */}
      {numbers && (
        <div>
          <div className="text-xs text-gray-500 mb-2">
            9 plenos · cilindro · centro: <span className="text-green-400 font-bold">{zone?.center ?? '?'}</span>
            {!isActive && <span className="ml-2 text-yellow-600">{status === 'STANDBY' && analytics?.quality < MIN_QUALITY ? '(calidad insuficiente)' : ''}</span>}
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
      {isActive && (
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

      {/* ── Progression (always shown) ── */}
      <div>
        <div className="text-xs text-gray-500 mb-1.5">Progresión ({MAX_STEPS} pasos · pérd. máx. 144f):</div>
        <StepBar currentStep={step} isActive={isActive} />
        <div className="text-xs text-gray-700 mt-1 text-center">
          chips/núm · ganancia neta acumulada si acierta en ese paso
        </div>
      </div>

      {/* ── How it works (when not active) ── */}
      {!isActive && status !== 'COOLING' && (
        <div className="bg-gray-800/40 rounded-lg p-2.5 text-xs text-gray-500 flex flex-col gap-0.5">
          <div className="font-semibold text-gray-400 mb-1">Criterios de activación:</div>
          <div>• Z-score ≥ 1.63 (p &lt; 0.10) en ventana de {ANALYSIS_WINDOW} tiradas</div>
          <div>• Z-score ≤ {3.5} (anti-spike — picos extremos revierten)</div>
          <div>• Calidad mínima {MIN_QUALITY}/100 (z + persistencia + estabilidad)</div>
          <div>• Cobertura: 9/37 = <strong className="text-gray-300">24.3%</strong> por tirada</div>
        </div>
      )}

      {/* ── Counters ── */}
      <div className="flex gap-3 text-xs text-gray-500 border-t border-gray-800 pt-2">
        <span>✅ Ciclos: <span className="text-green-400 font-bold">{cyclesCompleted}</span></span>
        <span>⛔ Abortados: <span className="text-red-400 font-bold">{cyclesAborted}</span></span>
        <span className="ml-auto text-gray-600">ventana {ANALYSIS_WINDOW} · ±{ZONE_RADIUS} · min {MIN_ZONE_HITS}h</span>
      </div>
    </div>
  );
}
