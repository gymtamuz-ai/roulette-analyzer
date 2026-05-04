import { JACOBO_NUMBERS, JACOBO_PRO_PROGRESSION } from '../utils/jacobo';
import { RED_NUMBERS } from '../utils/roulette';

// ─── Sub-components ────────────────────────────────────────────────────────────
function NumChip({ n }) {
  const cls = n === 0
    ? 'bg-green-800 text-green-200'
    : RED_NUMBERS.has(n) ? 'bg-red-800 text-red-100' : 'bg-gray-600 text-gray-100';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${cls}`}>{n}</span>
  );
}

function ResultPill({ r }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black
      ${r === 'win' ? 'bg-green-600' : 'bg-red-700'} text-white`}>
      {r === 'win' ? 'G' : 'P'}
    </span>
  );
}

// ─── Confidence bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const color = value >= 65 ? 'bg-green-500' : value >= 35 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{value}%</span>
    </div>
  );
}

// ─── Cond badge ────────────────────────────────────────────────────────────────
function CondBadge({ active, label }) {
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
      ${active
        ? 'border-yellow-600 bg-yellow-900/30 text-yellow-300'
        : 'border-gray-700 bg-gray-800 text-gray-600'}`}>
      <span>{active ? '✓' : '·'}</span>
      <span>{label}</span>
    </div>
  );
}

// ─── Status header ─────────────────────────────────────────────────────────────
function StatusHeader({ status, reason, confidence }) {
  const config = {
    ACTIVE: {
      border: 'border-yellow-500', bg: 'bg-yellow-900/20',
      icon: '⚡', label: 'JACOBO PRO · ACTIVO', textColor: 'text-yellow-400',
      dot: '🟢',
    },
    INACTIVE: {
      border: 'border-gray-600', bg: 'bg-gray-800/40',
      icon: '⏸', label: 'JACOBO PRO · INACTIVO', textColor: 'text-gray-400',
      dot: '🟡',
    },
    BLOCKED: {
      border: 'border-red-700', bg: 'bg-red-900/20',
      icon: '🛑', label: 'JACOBO PRO · BLOQUEADO', textColor: 'text-red-400',
      dot: '🔴',
    },
  }[status] || { border: 'border-gray-700', bg: 'bg-gray-800', icon: '⏳', label: 'JACOBO PRO', textColor: 'text-gray-400', dot: '🟡' };

  return (
    <div className={`rounded-xl p-3 border-2 ${config.border} ${config.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <div className={`text-base font-black tracking-wider ${config.textColor}`}>
          {config.dot} {config.label}
        </div>
      </div>
      <div className="text-gray-400 text-xs mb-2">{reason}</div>
      {status === 'ACTIVE' && confidence > 0 && (
        <ConfidenceBar value={confidence} />
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function JacoboPanel({ state }) {
  if (!state) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 text-center">
        <div className="text-4xl mb-2">⏳</div>
        <div className="text-gray-400 text-sm">Sin datos</div>
      </div>
    );
  }

  const {
    status = 'INACTIVE',
    reason = '',
    confidence = 0,
    currentStep, totalSteps,
    chipsPerNumber, totalChips,
    netProfitIfWin, currentCycleInvested,
    isLastStep, onWin, onLoss,
    cyclesCompleted = 0, cyclesAborted = 0,
    currentCycleHistory = [],
    opportunity, risk,
    spinsRemaining,
  } = state;

  const isActive  = status === 'ACTIVE';
  const isBlocked = status === 'BLOCKED';

  return (
    <div className="flex flex-col gap-3">

      {/* ── Status header ── */}
      <StatusHeader status={status} reason={reason} confidence={confidence} />

      {/* ── Opportunity conditions (INACTIVE / ACTIVE) ── */}
      {opportunity && (
        <div className="bg-gray-800/60 rounded-lg p-2.5">
          <div className="text-xs text-gray-500 mb-1.5">Condiciones de activación:</div>
          <div className="flex flex-wrap gap-1.5">
            <CondBadge active={opportunity.condA}
              label={`A: ${opportunity.inTop12 ?? 0}/5 en TOP-12`} />
            <CondBadge active={opportunity.condB}
              label={`B: ${opportunity.recentHits ?? '?'}/20 recientes`} />
            <CondBadge active={opportunity.condC}
              label={`C: atraso ${opportunity.avgSetDelay ?? '?'} > ${opportunity.avgGlobalDelay ?? '?'}`} />
          </div>
        </div>
      )}

      {/* ── Risk info ── */}
      {risk && risk.hitRate !== null && (
        <div className={`rounded-lg p-2 text-xs flex items-center justify-between
          ${risk.isHighRisk
            ? 'bg-red-900/20 border border-red-800 text-red-400'
            : 'bg-gray-800/40 border border-gray-700 text-gray-500'}`}>
          <span>{risk.isHighRisk ? '⚠️ Riesgo alto' : '✓ Riesgo normal'}</span>
          <span>hit rate {(risk.hitRate * 100).toFixed(0)}% en últ.{risk.window}</span>
        </div>
      )}

      {/* ── Blocked info ── */}
      {isBlocked && spinsRemaining > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-center">
          <div className="text-red-400 font-bold text-sm">🛑 Pausa de protección</div>
          <div className="text-gray-400 text-xs mt-1">
            Reactivación en <span className="text-red-300 font-bold">{spinsRemaining}</span> tiradas
          </div>
        </div>
      )}

      {/* ── Active: bet info ── */}
      {isActive && currentStep && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-xs text-gray-400">Paso</div>
              <div className="text-xl font-black text-yellow-400">{currentStep}/{totalSteps}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-xs text-gray-400">Por número</div>
              <div className="text-xl font-black text-white">{chipsPerNumber}f</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-xs text-gray-400">Total apuesta</div>
              <div className="text-xl font-black text-orange-400">{totalChips}f</div>
            </div>
          </div>

          {/* Net profit callout */}
          <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
            <div className="text-xs text-gray-400 mb-1">Ganancia neta si acierta ahora</div>
            <div className={`text-2xl font-black ${netProfitIfWin > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {netProfitIfWin > 0 ? '+' : ''}{netProfitIfWin} fichas
            </div>
            {currentCycleInvested > 0 && (
              <div className="text-xs text-gray-500 mt-0.5">Invertido en ciclo: {currentCycleInvested}f</div>
            )}
          </div>

          {/* Win / Loss */}
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

      {/* ── Step progression (always shown when step data available) ── */}
      {currentStep && (
        <div>
          <div className="text-xs text-gray-400 mb-1.5">Progresión:</div>
          <div className="flex gap-1">
            {JACOBO_PRO_PROGRESSION.map(({ step, chipsPerNumber: c, totalChips: tot }) => {
              const investedBefore = JACOBO_PRO_PROGRESSION.slice(0, step - 1)
                .reduce((s, x) => s + x.totalChips, 0);
              const netP     = 15 * c - investedBefore;
              const isPast   = step < currentStep;
              const isCurr   = step === currentStep;
              return (
                <div key={step} className={`flex-1 text-center rounded p-1 text-xs font-bold transition-all
                  ${isPast ? 'bg-red-900/50 text-red-300'
                    : isCurr && isActive ? 'bg-yellow-700 border border-yellow-400 text-white'
                    : isCurr ? 'bg-gray-700 border border-gray-500 text-gray-300'
                    : 'bg-gray-800 text-gray-600'}`}>
                  <div className="font-semibold">{step}</div>
                  <div className="font-normal opacity-80">{c}f</div>
                  <div className={`text-xs ${isPast ? 'text-red-400' : netP > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {isPast ? '✗' : `+${netP}`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-gray-700 mt-1 text-center">
            chips/núm · ganancia neta si acierta en ese paso
          </div>
        </div>
      )}

      {/* ── Numbers ── */}
      {isActive && (
        <div>
          <div className="text-xs text-gray-400 mb-1.5">21 plenos apostados:</div>
          <div className="flex flex-wrap gap-1">
            {JACOBO_NUMBERS.map(n => <NumChip key={n} n={n} />)}
          </div>
        </div>
      )}

      {/* ── Cycle history ── */}
      {currentCycleHistory?.length > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-1.5">Ciclo actual:</div>
          <div className="flex flex-wrap gap-1">
            {currentCycleHistory.map((r, i) => <ResultPill key={i} r={r.result} />)}
          </div>
        </div>
      )}

      {/* ── Counters ── */}
      <div className="flex gap-3 text-xs text-gray-500 border-t border-gray-800 pt-2">
        <span>✅ Ciclos: <span className="text-green-400 font-bold">{cyclesCompleted}</span></span>
        <span>⛔ Abortados: <span className="text-red-400 font-bold">{cyclesAborted}</span></span>
      </div>
    </div>
  );
}
