import { MIRROR_PROGRESSION, MIRROR_WINDOW, MIN_LOSS_STREAK, EXTENDED_MAX_STEPS } from '../utils/mirror';

// ─── Labels por modo ──────────────────────────────────────────────────────────
const MODE_CONFIG = {
  color: {
    label: '🔴 Color',
    values: {
      red:   { label: 'ROJO',  cls: 'bg-red-800 text-red-100 border-red-600' },
      black: { label: 'NEGRO', cls: 'bg-gray-700 text-gray-100 border-gray-500' },
    },
  },
  parity: {
    label: '🔢 Paridad',
    values: {
      even: { label: 'PAR',   cls: 'bg-blue-800 text-blue-100 border-blue-600' },
      odd:  { label: 'IMPAR', cls: 'bg-purple-800 text-purple-100 border-purple-600' },
    },
  },
  range: {
    label: '📊 Rango',
    values: {
      low:  { label: '1–18',  cls: 'bg-teal-800 text-teal-100 border-teal-600' },
      high: { label: '19–36', cls: 'bg-orange-800 text-orange-100 border-orange-600' },
    },
  },
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function ValueBadge({ value, mode, small, highlight }) {
  const cfg = MODE_CONFIG[mode]?.values[value];
  if (!cfg) return <span className="text-gray-700 text-xs px-1">—</span>;
  return (
    <span className={`inline-flex items-center justify-center rounded border font-bold transition-all
      ${small ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-0.5'}
      ${cfg.cls}
      ${highlight ? 'ring-2 ring-cyan-400 scale-110' : ''}`}>
      {cfg.label}
    </span>
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

function ModeSelector({ selected, onChange }) {
  return (
    <div className="flex gap-1">
      {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`flex-1 py-1.5 text-xs font-bold rounded border transition-all
            ${selected === key
              ? 'bg-cyan-700 border-cyan-500 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'}`}>
          {cfg.label}
        </button>
      ))}
    </div>
  );
}

// ─── Racha progress dots ──────────────────────────────────────────────────────
function StreakDots({ current, needed = MIN_LOSS_STREAK }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: needed }, (_, i) => (
        <div key={i} className={`w-3 h-3 rounded-full border transition-all
          ${i < current
            ? 'bg-cyan-400 border-cyan-300'
            : 'bg-gray-700 border-gray-600'}`} />
      ))}
      <span className="text-xs text-gray-500 ml-1">{current}/{needed}</span>
    </div>
  );
}

// ─── Step progression bar ─────────────────────────────────────────────────────
function StepBar({ currentStep, totalSteps }) {
  return (
    <div className="flex gap-0.5">
      {MIRROR_PROGRESSION.slice(0, totalSteps).map(({ step, chips }) => {
        const isPast    = step < currentStep;
        const isCurrent = step === currentStep;
        const isFuture  = step > currentStep;
        return (
          <div key={step} className={`flex-1 text-center rounded py-1 text-xs font-bold transition-all
            ${isPast    ? 'bg-red-900/50 text-red-400'
              : isCurrent ? 'bg-cyan-700 border border-cyan-400 text-white'
              : isFuture  ? 'bg-gray-800 text-gray-600'
              : ''}`}>
            <div>{step}</div>
            <div className="font-normal opacity-70">{chips}f</div>
            {isPast && <div className="text-red-500 text-xs">✗</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function MirrorPanel({ state, mirrorMode = 'color', onMirrorModeChange, hideSelector = false }) {
  const handleMode = (m) => { if (onMirrorModeChange) onMirrorModeChange(m); };

  if (!state) {
    return (
      <div className="flex flex-col gap-3">
        {!hideSelector && <ModeSelector selected={mirrorMode} onChange={handleMode} />}
        <div className="bg-gray-800 rounded-xl p-4 text-center text-gray-400 text-sm">Sin datos</div>
      </div>
    );
  }

  const {
    status = 'WAITING', reason = '', isActive,
    lossStreak = 0, sequence = [], invertedSequence = [],
    currentBet, currentStep = 1, totalSteps = EXTENDED_MAX_STEPS, chips = 1,
    isLastStep, onWin, onLoss,
    cyclesCompleted = 0, cyclesAborted = 0,
    currentCycleHistory = [], spinsRemaining,
    selectedMode = mirrorMode,
  } = state;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Mode selector ── */}
      {!hideSelector && <ModeSelector selected={mirrorMode} onChange={handleMode} />}

      {/* ── Status header ── */}
      {status === 'BLOCKED' ? (
        <div className="rounded-xl p-3 border-2 border-red-700 bg-red-900/20 text-center">
          <div className="text-base font-black text-red-400">🛑 BLOQUEADO</div>
          <div className="text-gray-400 text-xs mt-1">{reason}</div>
          {spinsRemaining > 0 && (
            <div className="text-red-300 font-bold text-sm mt-1">
              {spinsRemaining} tirada{spinsRemaining !== 1 ? 's' : ''} restantes
            </div>
          )}
        </div>
      ) : status === 'ACTIVE' ? (
        <div className="rounded-xl p-3 border-2 border-cyan-500 bg-cyan-900/20">
          <div className="text-base font-black text-cyan-400 mb-1">⚡ ESPEJO ACTIVO</div>
          <div className="text-gray-400 text-xs">{reason}</div>
          {totalSteps === EXTENDED_MAX_STEPS && (
            <div className="text-cyan-600 text-xs mt-0.5">Ciclo extendido: {totalSteps} pasos</div>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-3 border border-gray-700 bg-gray-800/40">
          <div className="text-sm font-bold text-gray-400 mb-1">⏸ ESPERANDO RACHA</div>
          <div className="text-gray-500 text-xs">{reason}</div>
        </div>
      )}

      {/* ── ACTIVE: apuesta actual ── */}
      {isActive && currentBet && (
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1.5">Apuesta ahora:</div>
          <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 font-black text-lg
            ${MODE_CONFIG[selectedMode]?.values[currentBet]?.cls || 'bg-gray-700 border-gray-500 text-white'}`}>
            {MODE_CONFIG[selectedMode]?.values[currentBet]?.label || currentBet}
          </div>
          <div className="text-gray-500 text-xs mt-1">{chips}f · chance simple 1:1</div>
        </div>
      )}

      {/* ── WAITING: racha progress ── */}
      {!isActive && status === 'WAITING' && (
        <div className="bg-gray-800/60 rounded-lg p-2.5">
          <div className="text-xs text-gray-500 mb-2">Racha de repeticiones detectada:</div>
          <StreakDots current={lossStreak} needed={MIN_LOSS_STREAK} />
          <div className="text-xs text-gray-600 mt-1.5 text-center">
            Activación en racha ≥ {MIN_LOSS_STREAK} → ciclo de {EXTENDED_MAX_STEPS} pasos
          </div>
        </div>
      )}

      {/* ── Sequence: últimas 10 → espejo ── */}
      {sequence.length > 0 && (
        <div className="bg-gray-800/60 rounded-lg p-2.5">
          <div className="text-xs text-gray-500 mb-2">
            Últimas {sequence.length}/{MIRROR_WINDOW} tiradas:
          </div>
          <div className="flex gap-0.5 flex-wrap mb-1.5">
            {sequence.map((v, i) => (
              <ValueBadge key={i} value={v} mode={selectedMode} small />
            ))}
          </div>
          <div className="text-gray-700 text-xs text-center mb-1.5">↓ espejo</div>
          <div className="flex gap-0.5 flex-wrap">
            {invertedSequence.map((v, i) => {
              const isLast = i === invertedSequence.length - 1;
              return (
                <ValueBadge key={i} value={v} mode={selectedMode} small highlight={isLast && isActive} />
              );
            })}
          </div>
          {isActive && (
            <div className="text-xs text-cyan-500/70 mt-1.5 text-center">
              ↑ Último valor = apuesta activa
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVE: stats ── */}
      {isActive && (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-xs text-gray-400">Paso</div>
            <div className="text-xl font-black text-cyan-400">{currentStep}/{totalSteps}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-xs text-gray-400">Fichas</div>
            <div className="text-xl font-black text-white">{chips}f</div>
          </div>
        </div>
      )}

      {/* ── Progression bar ── */}
      {(isActive || status === 'WAITING') && (
        <div>
          <div className="text-xs text-gray-400 mb-1.5">
            Progresión ({isActive ? totalSteps : EXTENDED_MAX_STEPS} pasos):
          </div>
          <StepBar currentStep={currentStep} totalSteps={isActive ? totalSteps : EXTENDED_MAX_STEPS} />
          {!isActive && (
            <div className="text-xs text-gray-700 mt-1 text-center">
              Se extiende a {EXTENDED_MAX_STEPS} pasos al detectar racha
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVE: Win / Loss outcomes ── */}
      {isActive && onWin && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg p-2 border border-green-700 bg-green-900/10">
            <div className="text-green-400 font-semibold mb-1">Si GANA →</div>
            <div className="text-gray-300">{onWin}</div>
          </div>
          <div className={`rounded-lg p-2 border ${isLastStep ? 'border-red-700 bg-red-900/20' : 'border-gray-700 bg-gray-800'}`}>
            <div className="text-red-400 font-semibold mb-1">Si PIERDE →</div>
            {onLoss?.startsWith('STOP')
              ? <div className="text-red-300 font-bold">⛔ {onLoss}</div>
              : <div className="text-gray-300">{onLoss}</div>}
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
        <span className="ml-auto text-gray-600">ventana {MIRROR_WINDOW} · racha ≥{MIN_LOSS_STREAK}</span>
      </div>
    </div>
  );
}
