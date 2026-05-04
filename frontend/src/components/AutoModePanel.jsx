import { MIN_SCORE_TO_BET } from '../utils/autoSystem';

// ─── Config ────────────────────────────────────────────────────────────────────
const SYSTEM_CFG = {
  ESPEJO: {
    label:  '🪞 ESPEJO',
    border: 'border-cyan-500',
    bg:     'bg-cyan-900/20',
    text:   'text-cyan-400',
    bar:    'bg-cyan-500',
  },
  SECTORES: {
    label:  '🎯 SECTORES',
    border: 'border-blue-500',
    bg:     'bg-blue-900/20',
    text:   'text-blue-400',
    bar:    'bg-blue-500',
  },
  JACOBO: {
    label:  '⚡ JACOBO',
    border: 'border-yellow-500',
    bg:     'bg-yellow-900/20',
    text:   'text-yellow-400',
    bar:    'bg-yellow-500',
  },
};

const SCORE_ROWS = [
  { key: 'espejo',   label: '🪞 Espejo',   system: 'ESPEJO'   },
  { key: 'sectores', label: '🎯 Sectores', system: 'SECTORES' },
  { key: 'jacobo',   label: '⚡ Jacobo',   system: 'JACOBO'   },
];

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, isChosen, barColor }) {
  const pct = Math.max(0, Math.min(100, (score / 60) * 100)); // 60 = theoretical max
  const scoreColor =
    score >= 40 ? 'text-green-400' :
    score >= 25 ? 'text-yellow-400' :
    score > 0   ? 'text-gray-400'   : 'text-red-400';

  return (
    <div className={`rounded-lg p-2 border transition-all ${
      isChosen
        ? 'border-white/20 bg-white/5'
        : 'border-gray-700 bg-gray-800/60'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-1.5">
          {score >= MIN_SCORE_TO_BET && (
            <span className="text-xs text-green-500">✓</span>
          )}
          <span className={`text-sm font-black ${scoreColor}`}>{score}</span>
        </div>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isChosen ? barColor : (score >= MIN_SCORE_TO_BET ? 'bg-green-600' : 'bg-gray-600')
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AutoModePanel({ autoState }) {
  if (!autoState) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 text-center text-gray-400 text-sm">
        Sin datos
      </div>
    );
  }

  const { system, confidence, reason, locked, scoreBreakdown } = autoState;
  const cfg = system ? SYSTEM_CFG[system] : null;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Auto mode badge ── */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
        <span className="text-xs font-black text-yellow-400 tracking-wide">MODO AUTO</span>
        {locked && (
          <span className="ml-auto text-xs text-cyan-400 font-bold">🔒 CICLO ACTIVO</span>
        )}
      </div>

      {/* ── Selected system card ── */}
      {system ? (
        <div className={`rounded-xl p-4 border-2 text-center ${cfg.border} ${cfg.bg}`}>
          <div className={`text-xl font-black ${cfg.text}`}>{cfg.label}</div>
          <div className="mt-2 flex items-baseline justify-center gap-1.5">
            <span className={`text-4xl font-black ${cfg.text}`}>{confidence}</span>
            <span className="text-gray-400 text-sm">% confianza</span>
          </div>
          <div className="text-gray-400 text-xs mt-2 leading-snug">{reason}</div>
        </div>
      ) : (
        <div className="rounded-xl p-4 border-2 border-gray-700 bg-gray-800/40 text-center">
          <div className="text-3xl mb-2">⏸</div>
          <div className="text-gray-300 font-black text-lg">NO APOSTAR</div>
          <div className="text-gray-500 text-xs mt-1.5 leading-snug">{reason}</div>
        </div>
      )}

      {/* ── Score breakdown ── */}
      {scoreBreakdown && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-gray-500 flex items-center justify-between">
            <span>Puntuación por sistema</span>
            <span className="text-gray-700">umbral ≥{MIN_SCORE_TO_BET}</span>
          </div>
          {SCORE_ROWS.map(({ key, label, system: sys }) => (
            <ScoreBar
              key={key}
              label={label}
              score={scoreBreakdown[key]}
              isChosen={system === sys}
              barColor={SYSTEM_CFG[sys]?.bar}
            />
          ))}
        </div>
      )}

      {/* ── Lock explanation ── */}
      {locked && (
        <div className="text-xs text-gray-600 text-center border-t border-gray-800 pt-2">
          Sistema bloqueado hasta fin del ciclo actual
        </div>
      )}
    </div>
  );
}
