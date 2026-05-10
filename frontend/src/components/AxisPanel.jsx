// ═══════════════════════════════════════════════════════════════════════════════
// AXIS PANEL — Phase 1 UI
// Muestra la grilla 6×6, estado del motor, sectores activos y bet.
// ═══════════════════════════════════════════════════════════════════════════════

import { AXIS_GRID } from '../utils/axis';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, triggeredH, triggeredV, aceNumber, spinsRemaining }) {
  const spin = spinsRemaining > 0 ? ` · ${4 - spinsRemaining + 1}/4` : '';

  if (status === 'IDLE') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-800 text-gray-500">
        IDLE
      </span>
    );
  }
  if (status === 'COOLDOWN') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-900/60 text-purple-300">
        COOLDOWN
      </span>
    );
  }
  if (status === 'TRIGGERED_ECLIPSE') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-600 text-black animate-pulse">
        ⭐ ECLIPSE {aceNumber}{spin}
      </span>
    );
  }
  if (status === 'TRIGGERED_H') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-700 text-white">
        ↔ H{triggeredH} ACTIVO{spin}
      </span>
    );
  }
  if (status === 'TRIGGERED_V') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-700 text-white">
        ↕ V{triggeredV} ACTIVO{spin}
      </span>
    );
  }
  return null;
}

// ─── Individual grid cell ─────────────────────────────────────────────────────
function GridCell({ num, rowIdx, colIdx, triggeredH, triggeredV, betNumbers, aceNumber }) {
  const isHRow    = triggeredH !== null && rowIdx === triggeredH - 1;
  const isVCol    = triggeredV !== null && colIdx === triggeredV - 1;
  const isEclipse = isHRow && isVCol && num === aceNumber;
  const isBet     = betNumbers.includes(num);

  let cls = 'bg-gray-800 text-gray-500';

  if (isEclipse) {
    cls = 'bg-yellow-400 text-black font-black ring-2 ring-yellow-200 scale-105';
  } else if (isHRow && isVCol) {
    // Both triggered but not the ace cell (shouldn't happen in Phase 1)
    cls = 'bg-blue-500 text-white font-bold';
  } else if (isHRow) {
    cls = 'bg-blue-800 text-blue-100 font-semibold';
  } else if (isVCol) {
    cls = 'bg-orange-800 text-orange-100 font-semibold';
  } else if (isBet) {
    cls = 'bg-green-800/60 text-green-200';
  }

  return (
    <div className={`rounded text-center text-xs py-1 transition-all duration-200 ${cls}`}>
      {num}
    </div>
  );
}

// ─── Sector pill ──────────────────────────────────────────────────────────────
function SectorPill({ label, stat, isActive, activeColor }) {
  const { status: st, lastSeenAgo } = stat ?? { status: 'unplayed', lastSeenAgo: null };
  const ago = lastSeenAgo !== null ? `(${lastSeenAgo})` : '';

  let cls = 'bg-gray-800 text-gray-500';
  if (isActive)          cls = `${activeColor} text-white font-bold`;
  else if (st === 'hot')      cls = 'bg-green-900 text-green-300';
  else if (st === 'sleeping') cls = 'bg-gray-900 text-gray-700';

  const icon = st === 'hot' ? '🔥' : st === 'sleeping' ? '😴' : '';

  return (
    <div className={`px-1.5 py-0.5 rounded text-xs font-mono ${cls}`}>
      {icon}{label}<span className="opacity-50 ml-0.5">{ago}</span>
    </div>
  );
}

// ─── Countdown dots ───────────────────────────────────────────────────────────
function SpinDots({ spinsRemaining }) {
  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3, 4].map(i => {
        const done   = i <= (4 - spinsRemaining);
        const active = i === (4 - spinsRemaining + 1);
        return (
          <div key={i}
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
              ${done   ? 'bg-green-600 text-white' :
                active  ? 'bg-blue-500 text-white ring-2 ring-blue-300' :
                          'bg-gray-700 text-gray-500'}`}>
            {i}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function AxisPanel({ state }) {
  if (!state) {
    return (
      <div className="text-gray-500 text-sm text-center py-6">
        Registrá tiradas para activar AXIS
      </div>
    );
  }

  const {
    status, triggeredH, triggeredV, aceNumber,
    betNumbers, spinsRemaining, sectorStats, debugLog,
    cyclesWon = 0, cyclesAborted = 0,
  } = state;

  const isActive = spinsRemaining > 0;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Header: nombre + badge ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 tracking-wider">🔷 AXIS</span>
        <StatusBadge
          status={status}
          triggeredH={triggeredH}
          triggeredV={triggeredV}
          aceNumber={aceNumber}
          spinsRemaining={spinsRemaining}
        />
      </div>

      {/* ── 6×6 Grid ── */}
      <div>
        {/* Column headers */}
        <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: 'auto repeat(6, 1fr)' }}>
          <div />
          {[1, 2, 3, 4, 5, 6].map(v => (
            <div key={v} className={`text-center text-xs font-bold py-0.5 rounded
              ${triggeredV === v ? 'text-orange-400' : 'text-gray-700'}`}>
              V{v}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {AXIS_GRID.map((row, rowIdx) => (
          <div key={rowIdx} className="grid gap-0.5 mb-0.5"
            style={{ gridTemplateColumns: 'auto repeat(6, 1fr)' }}>
            {/* Row label */}
            <div className={`text-xs font-bold text-center py-1 rounded
              ${triggeredH === rowIdx + 1 ? 'text-blue-400' : 'text-gray-700'}`}>
              H{rowIdx + 1}
            </div>
            {/* Cells */}
            {row.map((num, colIdx) => (
              <GridCell
                key={colIdx}
                num={num}
                rowIdx={rowIdx}
                colIdx={colIdx}
                triggeredH={triggeredH}
                triggeredV={triggeredV}
                betNumbers={betNumbers}
                aceNumber={aceNumber}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ── Active bet box ── */}
      {isActive && (
        <div className="rounded-xl p-3 border-2 border-green-600 bg-green-900/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-green-400">
              ⚡ APOSTAR — {betNumbers.length} fichas
            </span>
            <SpinDots spinsRemaining={spinsRemaining} />
          </div>

          <div className="flex flex-wrap gap-1">
            {betNumbers.map(n => (
              <span key={n}
                className={`px-2 py-0.5 rounded text-xs font-bold
                  ${n === aceNumber
                    ? 'bg-yellow-500 text-black ring-1 ring-yellow-200'
                    : 'bg-green-700 text-green-100'}`}>
                {n === aceNumber ? '⭐' : ''}{n}
              </span>
            ))}
          </div>

          {status === 'TRIGGERED_ECLIPSE' && aceNumber && (
            <div className="text-xs text-yellow-400 mt-1.5 font-semibold">
              ⭐ Ace {aceNumber} = intersección H{triggeredH} × V{triggeredV}
            </div>
          )}

          {/* Win / Loss outcomes */}
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div className="rounded p-1.5 border border-green-700 bg-green-900/10">
              <div className="text-green-400 font-semibold">Si GANA →</div>
              <div className="text-gray-300 mt-0.5">+{36 - betNumbers.length} fichas</div>
            </div>
            <div className="rounded p-1.5 border border-red-800 bg-red-900/10">
              <div className="text-red-400 font-semibold">Si PIERDE →</div>
              <div className="text-gray-300 mt-0.5">−{betNumbers.length} fichas</div>
            </div>
          </div>
        </div>
      )}

      {/* ── IDLE message ── */}
      {status === 'IDLE' && (
        <div className="text-center text-gray-600 text-xs py-1 border border-gray-800 rounded">
          Esperando trigger · 2 hits mismo sector en 3 tiradas
        </div>
      )}

      {/* ── Sector status strips ── */}
      <div className="space-y-1.5">
        <div>
          <div className="text-xs text-gray-600 mb-1">Sectores H (horizontales — arco del cilindro):</div>
          <div className="flex gap-1 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(s => (
              <SectorPill
                key={s}
                label={`H${s}`}
                stat={sectorStats?.h?.[s]}
                isActive={triggeredH === s}
                activeColor="bg-blue-700"
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">Sectores V (verticales — mismo color):</div>
          <div className="flex gap-1 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(s => (
              <SectorPill
                key={s}
                label={`V${s}`}
                stat={sectorStats?.v?.[s]}
                isActive={triggeredV === s}
                activeColor="bg-orange-700"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Cycle counters ── */}
      {(cyclesWon > 0 || cyclesAborted > 0) && (
        <div className="flex gap-3 text-xs text-gray-500 border-t border-gray-800 pt-2">
          <span>✅ Ganados: <span className="text-green-400 font-bold">{cyclesWon}</span></span>
          <span>⛔ Abortados: <span className="text-red-400 font-bold">{cyclesAborted}</span></span>
        </div>
      )}

      {/* ── Debug log (last 6 entries) ── */}
      {debugLog && debugLog.length > 0 && (
        <div className="bg-gray-900 rounded p-2 font-mono">
          <div className="text-xs text-gray-700 mb-1">Debug log:</div>
          {debugLog.slice(-6).map((line, i) => (
            <div key={i} className={`text-xs leading-snug
              ${line.includes('HIT')      ? 'text-green-400' :
                line.includes('expirado')  ? 'text-red-400'   :
                line.includes('Eclipse')   ? 'text-yellow-400':
                line.includes('Trigger')   ? 'text-blue-300'  :
                line.includes('Cooldown')  ? 'text-purple-400':
                'text-gray-600'}`}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
