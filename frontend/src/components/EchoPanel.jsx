// ═══════════════════════════════════════════════════════════════════════════════
// ECHO PANEL — Strategy UI
// Displays the live ECHO strategy state: active numbers, cycle progress,
// progression level, session analytics.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { computeEchoState, MAX_CYCLE_SPINS, ECHO_PROGRESSION } from '../utils/echo';

// ─── Progression level badge ──────────────────────────────────────────────────
const LEVEL_STYLES = {
  1: { color: 'text-green-300',  bg: 'bg-green-900/30',  border: 'border-green-700',  label: 'Nivel 1 — Inicio'    },
  2: { color: 'text-yellow-300', bg: 'bg-yellow-900/30', border: 'border-yellow-700', label: 'Nivel 2 — Moderado'  },
  3: { color: 'text-orange-300', bg: 'bg-orange-900/30', border: 'border-orange-700', label: 'Nivel 3 — Alto'      },
  4: { color: 'text-red-300',    bg: 'bg-red-900/30',    border: 'border-red-700',    label: 'Nivel 4 — MÁXIMO ⚠' },
};

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, cyclesWon, cyclesAborted }) {
  if (status === 'IDLE') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-800 text-gray-500">IDLE</span>
  );
  if (status === 'TRACKING') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-900/60 text-blue-300 border border-blue-700">
      🔍 TRACKING
    </span>
  );
  if (status === 'ACTIVE') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-800 text-green-100 animate-pulse border border-green-500">
      ⚡ ACTIVO
    </span>
  );
  return null;
}

// ─── Active numbers display ───────────────────────────────────────────────────
function ActiveNumbersDisplay({ activeNumbers, chipsPerNumber }) {
  if (activeNumbers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/20 px-3 py-3 text-center text-xs text-gray-600">
        Sin números activos — esperando repetidos
      </div>
    );
  }
  return (
    <div className="rounded-lg border-2 border-green-600 bg-green-900/15 px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-green-400">⚡ APOSTAR — Números activos</span>
        <span className="text-xs text-gray-500">{activeNumbers.length} números · {chipsPerNumber} fch/c/u</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activeNumbers.map(n => (
          <div key={n} className="relative">
            <span className="px-3 py-1.5 rounded-lg text-sm font-black bg-green-700 text-green-100 ring-2 ring-green-400 shadow-lg shadow-green-900/40">
              {n}
            </span>
            <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold bg-blue-600 text-white rounded-full px-1 leading-none py-0.5">
              {chipsPerNumber}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-600">
        Apuesta total: <span className="text-blue-300 font-bold">{chipsPerNumber * activeNumbers.length} fichas</span>
      </div>
    </div>
  );
}

// ─── Cycle progress bar ───────────────────────────────────────────────────────
function CycleProgress({ cycleSpins, spinsRemaining }) {
  const pct = Math.round((cycleSpins / MAX_CYCLE_SPINS) * 100);
  const danger = cycleSpins >= 28;
  const warn   = cycleSpins >= 20;
  const barColor = danger ? 'bg-red-500' : warn ? 'bg-orange-400' : 'bg-blue-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Progreso ciclo</span>
        <span className={`font-bold ${danger ? 'text-red-400' : warn ? 'text-orange-400' : 'text-gray-400'}`}>
          {cycleSpins}/{MAX_CYCLE_SPINS} spins · <span className="text-gray-500">{spinsRemaining} restantes</span>
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Progression level panel ──────────────────────────────────────────────────
function ProgressionPanel({ progressionLevel, cycleLoss, chipsPerNumber }) {
  const [expanded, setExpanded] = useState(false);
  const sty = LEVEL_STYLES[progressionLevel] ?? LEVEL_STYLES[1];

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${sty.border} ${sty.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400">📊 Progresión</span>
          <span className={`text-xs font-bold ${sty.color}`}>{sty.label}</span>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-gray-600 hover:text-gray-400">
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      <div className="mt-1.5 flex gap-4 text-xs">
        <span className="text-gray-500">Fichas/nro: <span className={`font-bold ${sty.color}`}>{chipsPerNumber}</span></span>
        <span className="text-gray-500">Pérd. ciclo:
          <span className={`font-bold ml-1 ${cycleLoss < -60 ? 'text-red-400' : cycleLoss < -20 ? 'text-orange-400' : 'text-gray-400'}`}>
            {cycleLoss}
          </span>
        </span>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-700 border-b border-gray-800">
                <th className="text-left py-0.5">Nivel</th>
                <th className="text-right">Fch/nro</th>
                <th className="text-right">Pérd. acum.</th>
              </tr>
            </thead>
            <tbody>
              {ECHO_PROGRESSION.map(row => {
                const isCurrent = row.level === progressionLevel;
                return (
                  <tr key={row.level}
                    className={`border-b border-gray-900 ${isCurrent ? 'bg-blue-900/30 text-white' : 'text-gray-600'}`}>
                    <td className={`py-0.5 ${isCurrent ? 'font-bold text-blue-300' : ''}`}>
                      {isCurrent ? '▶' : ''} L{row.level}
                    </td>
                    <td className="text-right">{row.chipsPerNumber}</td>
                    <td className="text-right text-orange-600">
                      {row.maxLoss === Infinity ? `≥ ${row.minLoss}` : `${row.minLoss}–${row.maxLoss}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Seen / repeaters summary ─────────────────────────────────────────────────
function TrackingStats({ seenNumbers, activeNumbers, cycleSpins }) {
  const repeatersCount = activeNumbers.length;
  const seenCount      = seenNumbers.length;
  if (cycleSpins === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 text-xs">
      <div className="rounded bg-gray-800/60 p-1.5 text-center">
        <div className="text-gray-600 text-[10px]">Vistos ciclo</div>
        <div className="font-bold text-gray-300">{seenCount}</div>
      </div>
      <div className="rounded bg-gray-800/60 p-1.5 text-center">
        <div className="text-gray-600 text-[10px]">Repetidos</div>
        <div className={`font-bold ${repeatersCount > 0 ? 'text-green-400' : 'text-gray-500'}`}>{repeatersCount}</div>
      </div>
      <div className="rounded bg-gray-800/60 p-1.5 text-center">
        <div className="text-gray-600 text-[10px]">Únicos restantes</div>
        <div className="font-bold text-gray-400">{37 - seenCount > 0 ? 37 - seenCount : 0}</div>
      </div>
    </div>
  );
}

// ─── Win preview ──────────────────────────────────────────────────────────────
function WinLossPreview({ winPreview, totalBet, cycleLoss, activeNumbers }) {
  if (!activeNumbers || activeNumbers.length === 0) return null;
  const netIfWin = winPreview + cycleLoss; // win profit + existing cycle loss
  return (
    <div className="grid grid-cols-2 gap-1.5 text-xs">
      <div className="rounded p-1.5 border border-green-800 bg-green-900/10">
        <div className="text-green-500 font-semibold text-[10px]">Si ACIERTA →</div>
        <div className="text-green-300 font-bold">+{winPreview} fichas</div>
        <div className={`text-[10px] mt-0.5 ${netIfWin >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
          Neto ciclo: {netIfWin >= 0 ? '+' : ''}{netIfWin}
        </div>
      </div>
      <div className="rounded p-1.5 border border-red-900 bg-red-900/10">
        <div className="text-red-500 font-semibold text-[10px]">Si PIERDE →</div>
        <div className="text-red-300 font-bold">−{totalBet} fichas</div>
        <div className="text-[10px] text-gray-600 mt-0.5">Ciclo: {cycleLoss - totalBet}</div>
      </div>
    </div>
  );
}

// ─── Session analytics ────────────────────────────────────────────────────────
function SessionAnalytics({ echoState }) {
  const {
    cyclesWon, cyclesAborted, totalCycles, totalBetSpins,
    wins, losses, winrate, sessionProfit, maxDrawdown,
    profitFactor, grossWin, grossLoss, avgActiveNumbers,
  } = echoState;

  if (totalBetSpins === 0 && totalCycles === 0) return null;

  const roi = grossWin + grossLoss > 0
    ? Math.round((sessionProfit / (grossWin + grossLoss)) * 100)
    : null;

  const cycleWinRate = totalCycles > 0 ? Math.round(cyclesWon / totalCycles * 100) : null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
      <div className="text-xs font-bold text-gray-500 mb-2">📈 Session Analytics</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">

        {/* Cycle level */}
        <div className="flex justify-between">
          <span className="text-gray-600">✅ Ciclos G.</span>
          <span className="font-bold text-green-400">{cyclesWon}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">❌ Ciclos A.</span>
          <span className="font-bold text-red-400">{cyclesAborted}</span>
        </div>

        {cycleWinRate !== null && (
          <div className="flex justify-between col-span-2 border-t border-gray-900 pt-0.5">
            <span className="text-gray-600">Tasa ciclos</span>
            <span className={`font-mono font-bold ${cycleWinRate >= 60 ? 'text-green-400' : cycleWinRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {cycleWinRate}% <span className="text-gray-700 font-normal">({totalCycles} ciclos)</span>
            </span>
          </div>
        )}

        {/* Spin level */}
        {totalBetSpins > 0 && (
          <>
            <div className="flex justify-between border-t border-gray-900 pt-0.5">
              <span className="text-gray-600">Apuestas</span>
              <span className="font-mono text-gray-300">{totalBetSpins}</span>
            </div>
            <div className="flex justify-between border-t border-gray-900 pt-0.5">
              <span className="text-gray-600">Hit rate</span>
              <span className={`font-mono font-bold ${(winrate ?? 0) >= 20 ? 'text-green-400' : 'text-gray-400'}`}>
                {winrate ?? '—'}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Profit</span>
              <span className={`font-mono font-bold ${sessionProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {sessionProfit >= 0 ? '+' : ''}{sessionProfit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Max DD</span>
              <span className={`font-mono ${maxDrawdown > 0 ? 'text-orange-400' : 'text-gray-600'}`}>-{maxDrawdown}</span>
            </div>
            {profitFactor > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">P.Factor</span>
                <span className="font-mono text-gray-300">{profitFactor}</span>
              </div>
            )}
            {avgActiveNumbers !== null && (
              <div className="flex justify-between">
                <span className="text-gray-600">Avg activos</span>
                <span className="font-mono text-gray-400">{avgActiveNumbers}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Debug log ────────────────────────────────────────────────────────────────
function DebugLog({ debugLog }) {
  const [open, setOpen] = useState(false);
  if (!debugLog || debugLog.length === 0) return null;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-400">
        <span className="font-semibold">🪲 Log motor ECHO</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 font-mono max-h-36 overflow-y-auto">
          {debugLog.slice(-12).map((line, i) => (
            <div key={i} className={`text-xs leading-snug ${
              line.includes('WON')     ? 'text-green-400' :
              line.includes('ABORTED') ? 'text-red-400'   :
              line.includes('repeated')? 'text-blue-300'  :
              'text-gray-600'
            }`}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PANEL ───────────────────────────────────────────────────────────────
export default function EchoPanel({ spins = [] }) {
  const echoState = useMemo(
    () => computeEchoState(spins),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spins.length]
  );

  const {
    status, isActive,
    activeNumbers, seenNumbers,
    cycleSpins, spinsRemaining,
    cycleLoss, progressionLevel, chipsPerNumber, totalBet, winPreview,
    cyclesWon, cyclesAborted,
    debugLog,
  } = echoState;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 tracking-wider">🔁 ECHO Strategy</span>
        <StatusBadge status={status} cyclesWon={cyclesWon} cyclesAborted={cyclesAborted} />
      </div>

      {/* ── Active numbers ── */}
      <ActiveNumbersDisplay activeNumbers={activeNumbers} chipsPerNumber={chipsPerNumber} />

      {/* ── Tracking stats ── */}
      <TrackingStats seenNumbers={seenNumbers} activeNumbers={activeNumbers} cycleSpins={cycleSpins} />

      {/* ── Cycle progress ── */}
      {cycleSpins > 0 && (
        <CycleProgress cycleSpins={cycleSpins} spinsRemaining={spinsRemaining} />
      )}

      {/* ── Win / Loss preview ── */}
      <WinLossPreview
        winPreview={winPreview}
        totalBet={totalBet}
        cycleLoss={cycleLoss}
        activeNumbers={activeNumbers}
      />

      {/* ── Progression panel ── */}
      <ProgressionPanel
        progressionLevel={progressionLevel}
        cycleLoss={cycleLoss}
        chipsPerNumber={chipsPerNumber}
      />

      {/* ── IDLE / TRACKING message ── */}
      {status === 'IDLE' && (
        <div className="text-center text-gray-600 text-xs py-2 border border-gray-800 rounded">
          Registrá tiradas para iniciar tracking ECHO
        </div>
      )}
      {status === 'TRACKING' && activeNumbers.length === 0 && (
        <div className="text-center text-blue-600 text-xs py-2 border border-blue-900/40 rounded bg-blue-900/10">
          🔍 Monitoreando repetidos — {seenNumbers.length} números vistos
        </div>
      )}

      {/* ── Session analytics ── */}
      <SessionAnalytics echoState={echoState} />

      {/* ── Debug log ── */}
      <DebugLog debugLog={debugLog} />
    </div>
  );
}
