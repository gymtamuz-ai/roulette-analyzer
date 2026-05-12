// ═══════════════════════════════════════════════════════════════════════════════
// AXIS REPLAY PANEL — Phase 4
// Timeline visual de activaciones AXIS: triggers, wins, losses, eclipses.
// Construido a partir de spins[] y results[].
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from 'react';

// ─── Build replay events from spins + results ─────────────────────────────────
function buildReplayTimeline(spins, results) {
  if (!spins || spins.length === 0) return [];

  // Index results by spin_index for fast lookup
  const resultBySpinIdx = {};
  for (const r of results) {
    if ((r.system_type || r.systemType) === 'AXIS' && r.spin_index != null) {
      resultBySpinIdx[r.spin_index] = r;
    }
  }

  // Find active ranges from results (spin_index marks when axis was betting)
  const activeIndices = new Set(Object.keys(resultBySpinIdx).map(Number));

  return spins.map((s, i) => {
    const num    = s.number ?? s;
    const result = resultBySpinIdx[i] ?? null;
    const isActive = activeIndices.has(i);
    const isWin    = result?.result === 'win';
    const isLoss   = result?.result === 'loss';

    // Detect trigger by looking at result bet_chips to infer type
    let eventType = 'idle';
    if (result) {
      const chips = result.bet_chips ?? result.chips ?? 0;
      if (chips > 0) {
        eventType = isWin ? 'win' : 'loss';
      }
    }

    return {
      idx:    i,
      num,
      color:  s.color,
      result,
      isActive,
      eventType,
      isWin,
      isLoss,
      profit: result?.profit ?? null,
    };
  });
}

// ─── Individual spin cell ─────────────────────────────────────────────────────
function SpinCell({ event, showNumbers }) {
  const { num, eventType, isWin, profit, color } = event;

  let bg = 'bg-gray-800/40';
  let textColor = 'text-gray-600';
  let ring = '';
  let icon = null;

  if (eventType === 'win') {
    bg = 'bg-green-800/60';
    textColor = 'text-green-200 font-bold';
    ring = 'ring-1 ring-green-500';
    icon = '✓';
  } else if (eventType === 'loss') {
    bg = 'bg-red-900/50';
    textColor = 'text-red-300';
    ring = 'ring-1 ring-red-700';
    icon = '✗';
  } else if (event.isActive) {
    bg = 'bg-blue-900/40';
    textColor = 'text-blue-300';
  }

  const numColor = color === 'red' ? 'text-red-400' : color === 'black' ? 'text-gray-300' : 'text-green-400';

  return (
    <div
      className={`relative rounded text-center transition-all ${bg} ${ring}`}
      style={{ minWidth: '24px', minHeight: '24px' }}
      title={`Spin ${event.idx + 1}: ${num}${profit != null ? ` (${profit >= 0 ? '+' : ''}${profit})` : ''}`}
    >
      {showNumbers ? (
        <span className={`text-xs ${event.isActive ? textColor : numColor}`}>{num}</span>
      ) : (
        <span className={`text-xs font-bold ${textColor}`}>{icon ?? (event.isActive ? '·' : '')}</span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AxisReplayPanel({ spins = [], results = [] }) {
  const [open,        setOpen]        = useState(false);
  const [showNumbers, setShowNumbers] = useState(true);
  const [window,      setWindow]      = useState(50); // last N spins to show

  if (!open) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-1.5">
        <button onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-300">
          <span className="font-semibold">🎬 Replay Timeline</span>
          <span>▼</span>
        </button>
      </div>
    );
  }

  const timeline = buildReplayTimeline(spins, results);
  const visible  = timeline.slice(-window);

  const axisResults = results.filter(r => (r.system_type || r.systemType) === 'AXIS');
  const wins        = axisResults.filter(r => r.result === 'win').length;
  const totalProfit = axisResults.reduce((s, r) => s + (r.profit ?? 0), 0);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 px-2.5 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400">🎬 Replay Timeline</span>
          {axisResults.length > 0 && (
            <span className="text-xs text-gray-600">
              {axisResults.length} apuestas · {wins}✓ ·
              <span className={totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                {' '}{totalProfit >= 0 ? '+' : ''}{totalProfit}
              </span>
            </span>
          )}
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-600 hover:text-gray-400">✕</button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setShowNumbers(n => !n)}
          className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400">
          {showNumbers ? '# nums' : '○ icons'}
        </button>
        {[30, 50, 100].map(w => (
          <button key={w}
            onClick={() => setWindow(w)}
            className={`text-xs px-1.5 py-0.5 rounded ${window === w ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-500 hover:bg-gray-600'}`}>
            {w}
          </button>
        ))}
        <span className="text-xs text-gray-700 ml-auto">últimas {visible.length}</span>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-800/60 ring-1 ring-green-500 inline-block"/>Win</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-900/50 ring-1 ring-red-700 inline-block"/>Loss</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-900/40 inline-block"/>Activo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-800/40 inline-block"/>Idle</span>
      </div>

      {/* Timeline grid */}
      {visible.length === 0 ? (
        <div className="text-xs text-gray-600 text-center py-2">Sin tiradas aún</div>
      ) : (
        <div className="flex flex-wrap gap-0.5">
          {visible.map(event => (
            <SpinCell key={event.idx} event={event} showNumbers={showNumbers} />
          ))}
        </div>
      )}

      {/* Rolling equity (text-based) */}
      {axisResults.length >= 5 && (
        <div className="mt-2 pt-1.5 border-t border-gray-800">
          <div className="text-xs text-gray-700 mb-1">Balance AXIS (sesión):</div>
          <div className="flex items-end gap-0.5 h-8">
            {axisResults.map((r, i) => {
              const runningTotal = axisResults.slice(0, i + 1).reduce((s, x) => s + (x.profit ?? 0), 0);
              const maxAbs = Math.max(1, ...axisResults.map((_, j) =>
                Math.abs(axisResults.slice(0, j + 1).reduce((s, x) => s + (x.profit ?? 0), 0))));
              const pct = Math.round(Math.abs(runningTotal) / maxAbs * 28);
              return (
                <div key={i}
                  className={`flex-1 rounded-sm min-w-[2px] ${runningTotal >= 0 ? 'bg-green-600' : 'bg-red-600'}`}
                  style={{ height: `${Math.max(2, pct)}px`, alignSelf: 'flex-end' }}
                  title={`${runningTotal >= 0 ? '+' : ''}${runningTotal}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
