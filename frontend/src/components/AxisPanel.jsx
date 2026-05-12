// ═══════════════════════════════════════════════════════════════════════════════
// AXIS PANEL — Phase 3 UI
// Grilla 6×6 + intelligence dashboard:
//   - confidence meter
//   - convergence badges
//   - wheel bias indicator
//   - trigger strength
//   - dealer signature
//   - anti-overtrade warning
//   - session analytics
//   - backtest (on-demand)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { AXIS_GRID } from '../utils/axis';
import {
  classifyAxisSector,
  findMemoryRow,
  getTopAxisSectors,
} from '../utils/axisHistory';
import { runAxisBacktest } from '../utils/axisBacktest';
import {
  computeProgressionOutput,
  AXIS6_PROGRESSIVE_TABLE,
} from '../strategies/axis6stars/moneyManagement/axisProgression';
import { getProgressionPhase } from '../strategies/axis6stars/moneyManagement/progressionState';
import { assessProgressionRisk } from '../strategies/axis6stars/moneyManagement/riskEngine';
import {
  computeProgressionLifecycle,
  LIFECYCLE_STATES,
} from '../strategies/axis6stars/moneyManagement/progressionLifecycle';

// ─── Meter bar ────────────────────────────────────────────────────────────────
function MeterBar({ value, max = 100, color = 'bg-blue-500', label, sublabel }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="font-bold text-gray-300">{sublabel ?? `${pct}%`}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Confidence indicator ─────────────────────────────────────────────────────
function ConfidenceMeter({ confidence, antiOvertrade }) {
  const color = confidence >= 70 ? 'bg-green-500'
              : confidence >= 50 ? 'bg-yellow-500'
              : confidence >= 35 ? 'bg-orange-500'
              : 'bg-red-600';

  const label = confidence >= 70 ? 'Alta'
              : confidence >= 50 ? 'Moderada'
              : confidence >= 35 ? 'Baja'
              : 'Muy baja';

  return (
    <div className={`rounded-lg p-2 border ${antiOvertrade?.blocked ? 'border-red-700 bg-red-900/10' : 'border-gray-700 bg-gray-900/40'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-gray-400">📊 Confidence</span>
        <span className={`text-sm font-black ${color.replace('bg-', 'text-')}`}>
          {confidence}%
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`}
             style={{ width: `${confidence}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-gray-600">{label}</span>
        {antiOvertrade?.blocked && (
          <span className="text-xs text-red-400 font-bold">⚠ Filtro activo</span>
        )}
      </div>
    </div>
  );
}

// ─── Anti-overtrade warning ───────────────────────────────────────────────────
function AntiOvertradeWarning({ antiOvertrade }) {
  if (!antiOvertrade?.blocked) return null;
  return (
    <div className="rounded-lg border border-red-700 bg-red-900/20 px-2.5 py-2">
      <div className="text-xs font-bold text-red-400 mb-0.5">🛑 Filtro Anti-Overtrading</div>
      {antiOvertrade.reasons.map((r, i) => (
        <div key={i} className="text-xs text-red-300/80 leading-snug">· {r}</div>
      ))}
    </div>
  );
}

// ─── Convergence badge row ────────────────────────────────────────────────────
function ConvergenceBadges({ convergence }) {
  if (!convergence || convergence.score === 0) return null;
  const color = convergence.score >= 60 ? 'bg-green-800/60 border-green-600 text-green-200'
              : convergence.score >= 35  ? 'bg-blue-800/60 border-blue-600 text-blue-200'
              : 'bg-gray-800/60 border-gray-600 text-gray-400';

  return (
    <div className={`flex items-center gap-2 rounded px-2 py-1 border text-xs ${color}`}>
      <span className="font-bold">⚡ {convergence.label}</span>
      <span className="opacity-70">{convergence.score}%</span>
      <div className="flex gap-1 ml-auto">
        {convergence.systems.map((s, i) => (
          <span key={i} className="px-1 rounded bg-white/10 font-mono text-xs">
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Intelligence dashboard (colapsable) ─────────────────────────────────────
function IntelligenceDashboard({ intelligence }) {
  const [open, setOpen] = useState(false);
  if (!intelligence) return null;

  const { triggerStrength, dealerSignature, wheelBiasConfidence, volatility, smartCooldown, convergence } = intelligence;

  const dealerColor = { none: 'text-gray-600', weak: 'text-yellow-500', moderate: 'text-orange-400', strong: 'text-red-400' };
  const biasColor   = { none: 'text-gray-600', weak: 'text-blue-400', moderate: 'text-cyan-300', strong: 'text-green-300' };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-300">
        <span className="font-semibold">🔬 Análisis Inteligente</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-2">
          {/* Trigger strength */}
          <MeterBar
            value={triggerStrength}
            color={triggerStrength >= 75 ? 'bg-yellow-500' : triggerStrength >= 50 ? 'bg-blue-500' : 'bg-gray-600'}
            label="Trigger Strength"
          />

          {/* Volatility (inverted: low is good) */}
          <MeterBar
            value={Math.round((1 - volatility) * 100)}
            color={volatility < 0.40 ? 'bg-green-500' : volatility < 0.70 ? 'bg-yellow-500' : 'bg-red-500'}
            label="Estabilidad de mesa"
            sublabel={`${Math.round((1 - volatility) * 100)}% (vol ${Math.round(volatility * 100)}%)`}
          />

          {/* Dealer signature */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Dealer Signature</span>
            <span className={`font-bold ${dealerColor[dealerSignature.level] ?? 'text-gray-500'}`}>
              {dealerSignature.level !== 'none'
                ? `${dealerSignature.level} (χ²=${dealerSignature.chi2})`
                : '— sin firma'}
            </span>
          </div>
          {dealerSignature.level !== 'none' && (
            <div className="text-xs text-gray-600 -mt-1">
              {dealerSignature.description}
              {dealerSignature.dominantH && ` · H${dealerSignature.dominantH} dominante`}
            </div>
          )}

          {/* Wheel bias */}
          <MeterBar
            value={wheelBiasConfidence.score}
            color={biasColor[wheelBiasConfidence.level]?.replace('text-', 'bg-') ?? 'bg-gray-600'}
            label="Wheel Bias Confidence"
            sublabel={`${wheelBiasConfidence.score}% ${wheelBiasConfidence.level !== 'none' ? `(${wheelBiasConfidence.level})` : ''}`}
          />

          {/* Smart cooldown */}
          {smartCooldown > 1 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">Smart Cooldown</span>
              <span className="text-purple-400 font-bold">{smartCooldown} spins recomendados</span>
            </div>
          )}

          {/* Intelligence debug log */}
          {intelligence.debugLog?.length > 0 && (
            <div className="mt-1 font-mono bg-gray-950/50 rounded p-1.5">
              {intelligence.debugLog.slice(-5).map((line, i) => (
                <div key={i} className={`text-xs leading-snug ${
                  line.includes('Confidence')      ? 'text-blue-300' :
                  line.includes('Convergencia')    ? 'text-green-400' :
                  line.includes('Dealer')          ? 'text-yellow-400' :
                  line.includes('Wheel bias')      ? 'text-cyan-400' :
                  line.includes('Overtrade')       ? 'text-red-400' :
                  line.includes('Cooldown')        ? 'text-purple-400' :
                  'text-gray-600'
                }`}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Progression Series Lifecycle Panel ──────────────────────────────────────
function LifecyclePanel({ lifecycle }) {
  if (!lifecycle || lifecycle.currentSeriesState === 'IDLE') return null;

  const { currentSeriesState, currentStep, recoveredSeries, failedSeries,
          recoveryRate, totalCompleted, recoveryPendingProfit,
          accumulatedExposure, currentSeriesLosses, averageRecoveryStep } = lifecycle;

  const lc = LIFECYCLE_STATES[currentSeriesState];

  const stateColors = {
    ACTIVE:    'border-blue-700 bg-blue-900/10',
    RECOVERED: 'border-green-600 bg-green-900/10',
    FAILED:    'border-red-600 bg-red-900/10',
  };

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${stateColors[currentSeriesState] ?? 'border-gray-700 bg-gray-900/20'}`}>
      {/* Header: current state */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-gray-400">🔄 Progresiones</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${lc.color} ${lc.bg} ${lc.border} border`}>
          {lc.icon} {lc.label}
        </span>
      </div>

      {/* Series counters */}
      <div className="flex gap-4 text-xs mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-600">✅ Recuperadas:</span>
          <span className="font-bold text-green-400">{recoveredSeries}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-600">❌ Fallidas:</span>
          <span className="font-bold text-red-400">{failedSeries}</span>
        </div>
        {totalCompleted > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <span className={`font-bold text-xs ${(recoveryRate ?? 0) >= 70 ? 'text-green-400' : (recoveryRate ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {recoveryRate}%
            </span>
          </div>
        )}
      </div>

      {/* Active series details */}
      {currentSeriesState === 'ACTIVE' && (
        <div className="flex gap-3 text-xs border-t border-gray-800/60 pt-1.5 flex-wrap">
          <span className="text-gray-600">Step actual:
            <span className="font-bold text-blue-300 ml-1">{currentStep}/20</span>
          </span>
          {currentSeriesLosses > 0 && (
            <span className="text-gray-600">Pérdidas serie:
              <span className="font-bold text-orange-400 ml-1">{currentSeriesLosses}</span>
            </span>
          )}
          {recoveryPendingProfit !== null && (
            <span className="text-gray-600 ml-auto">Si gana ahora:
              <span className="font-bold text-green-400 ml-1">+{recoveryPendingProfit}</span>
            </span>
          )}
        </div>
      )}

      {/* Recovery stats */}
      {averageRecoveryStep !== null && (
        <div className="text-xs text-gray-700 mt-1">
          Paso prom. de recup.: <span className="text-gray-500">{averageRecoveryStep}</span>
        </div>
      )}
    </div>
  );
}

// ─── Session analytics panel ──────────────────────────────────────────────────
function SessionAnalyticsPanel({ analytics, lifecycle }) {
  const { total, totalProfit, maxDrawdown, maxWinStreak, maxLossStreak, profitFactor, roi } = analytics ?? {};

  const hasLifecycle = lifecycle && lifecycle.totalBetSpins > 0;
  const hasAnalytics = total > 0;
  if (!hasLifecycle && !hasAnalytics) return null;

  const { recoveredSeries = 0, failedSeries = 0, recoveryRate = null } = lifecycle ?? {};
  const totalSeries     = recoveredSeries + failedSeries;
  const seriesWinPct    = recoveryRate;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
      <div className="text-xs font-bold text-gray-500 mb-2">📈 Session Analytics</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">

        {/* ── Series-level lifecycle metrics (correct Ganados/Abortados) ── */}
        <div className="flex justify-between">
          <span className="text-gray-600">✅ Recuperadas</span>
          <span className="font-mono font-bold text-green-400">{recoveredSeries}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">❌ Fallidas</span>
          <span className="font-mono font-bold text-red-400">{failedSeries}</span>
        </div>

        {totalSeries > 0 && (
          <div className="flex justify-between col-span-2 border-t border-gray-900 pt-0.5">
            <span className="text-gray-600">Tasa recup.</span>
            <span className={`font-mono font-bold ${(seriesWinPct ?? 0) >= 70 ? 'text-green-400' : (seriesWinPct ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {seriesWinPct !== null ? `${seriesWinPct}%` : '—'}
              {' '}<span className="text-gray-700 font-normal">({totalSeries} series)</span>
            </span>
          </div>
        )}

        {/* ── Spin-level P&L metrics ── */}
        {totalProfit !== undefined && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-600">Profit</span>
              <span className={`font-mono font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalProfit >= 0 ? '+' : ''}{totalProfit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">P.Factor</span>
              <span className="font-mono text-gray-300">{profitFactor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Max DD</span>
              <span className={`font-mono ${maxDrawdown > 0 ? 'text-orange-400' : 'text-gray-500'}`}>-{maxDrawdown}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">ROI</span>
              <span className={`font-mono ${roi >= 0 ? 'text-green-300' : 'text-red-300'}`}>{roi}%</span>
            </div>
          </>
        )}
        {maxWinStreak > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Racha G.</span>
            <span className="font-mono text-green-300">{maxWinStreak}✓</span>
          </div>
        )}
        {maxLossStreak > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Racha P.</span>
            <span className="font-mono text-red-300">{maxLossStreak}✗</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Backtest panel ───────────────────────────────────────────────────────────
function BacktestPanel({ spins }) {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  function runBacktest() {
    setLoading(true);
    // setTimeout lets React render the loading state first
    setTimeout(() => {
      const r = runAxisBacktest(spins);
      setResult(r);
      setLoading(false);
    }, 20);
  }

  if (!result && !loading) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">🔁 Backtest (últimas {Math.min(spins.length, 300)} tiradas)</span>
          <button
            onClick={runBacktest}
            disabled={spins.length < 10}
            className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-40">
            Ejecutar
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-800 px-2.5 py-2 text-xs text-gray-500 text-center animate-pulse">
        Ejecutando backtest…
      </div>
    );
  }

  if (!result || result.total === 0) {
    return (
      <div className="rounded-lg border border-gray-800 px-2.5 py-2 text-xs text-gray-600 text-center">
        Sin ciclos en el historial analizado.{' '}
        <button onClick={() => setResult(null)} className="text-gray-500 underline ml-1">↩</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 px-2.5 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-400">🔁 Backtest — {result.spinsAnalyzed} tiradas</span>
        <button onClick={() => setResult(null)} className="text-xs text-gray-600 hover:text-gray-400">↩</button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mb-2">
        {/* ── Series lifecycle (primary metrics) ── */}
        <div className="flex justify-between">
          <span className="text-gray-600">✅ Recuperadas</span>
          <span className="font-bold text-green-400">{result.recoveredSeries ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">❌ Fallidas</span>
          <span className="font-bold text-red-400">{result.failedSeries ?? '—'}</span>
        </div>
        {result.recoveryRate !== null && (
          <div className="flex justify-between col-span-2">
            <span className="text-gray-600">Tasa recup.</span>
            <span className={`font-bold ${result.recoveryRate >= 70 ? 'text-green-400' : result.recoveryRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {result.recoveryRate}%
              {result.averageRecoveryStep && (
                <span className="text-gray-700 font-normal"> · avg step {result.averageRecoveryStep}</span>
              )}
            </span>
          </div>
        )}
        {/* ── Spin-level P&L ── */}
        <div className="flex justify-between">
          <span className="text-gray-600">Profit</span>
          <span className={result.totalProfit >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
            {result.totalProfit >= 0 ? '+' : ''}{result.totalProfit}
          </span>
        </div>
        <div className="flex justify-between"><span className="text-gray-600">P.Factor</span><span className="text-gray-300">{result.profitFactor}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">Max DD</span><span className="text-orange-400">-{result.maxDrawdown}</span></div>
        <div className="flex justify-between"><span className="text-gray-600">ROI</span><span className={result.roi >= 0 ? 'text-green-300' : 'text-red-300'}>{result.roi}%</span></div>
        {result.maxStepReached > 1 && (
          <div className="flex justify-between col-span-2">
            <span className="text-gray-600">Peor step</span>
            <span className={`font-mono ${result.maxStepReached >= 13 ? 'text-red-400' : result.maxStepReached >= 8 ? 'text-orange-400' : 'text-yellow-400'}`}>
              {result.maxStepReached}/20
            </span>
          </div>
        )}
      </div>
      {/* Sector leaderboard */}
      {result.sectorList.length > 0 && (
        <div>
          <div className="text-xs text-gray-700 mb-1">Por sector (profit):</div>
          {result.sectorList.slice(0, 4).map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-mono text-gray-500">{s.key}</span>
              <div className="flex gap-2">
                <span className="text-gray-600">{s.cycles}c</span>
                <span className={`${s.winrate >= 55 ? 'text-green-400' : s.winrate <= 35 ? 'text-red-400' : 'text-gray-400'}`}>
                  {s.winrate}%
                </span>
                <span className={s.profit >= 0 ? 'text-green-300' : 'text-red-300'}>
                  {s.profit >= 0 ? '+' : ''}{s.profit}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Progression Panel ────────────────────────────────────────────────────────
function ProgressionPanel({ axisResults, betCount = 6 }) {
  const [expanded, setExpanded] = useState(false);

  const prog = useMemo(
    () => computeProgressionOutput(axisResults, betCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisResults.length, betCount]
  );

  const phase = getProgressionPhase(prog.step);
  const risk  = assessProgressionRisk(prog.step);

  if (axisResults.length === 0 && !expanded) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/20 px-2.5 py-1.5">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between text-xs text-gray-600 hover:text-gray-400">
          <span className="font-semibold">📊 Progresión AXIS6Stars</span>
          <span className="text-gray-700">Step 1 · 1 fch/nro ▼</span>
        </button>
      </div>
    );
  }

  // Step progress bar (1–20)
  const stepPct = Math.round((prog.step / 20) * 100);

  // Risk color for the bar
  const barColor = prog.step <= 4  ? 'bg-green-500'
                 : prog.step <= 7  ? 'bg-yellow-500'
                 : prog.step <= 12 ? 'bg-orange-500'
                 : 'bg-red-600';

  return (
    <div className={`rounded-lg border ${prog.isMaxLevel ? 'border-red-500 bg-red-950/20' : 'border-gray-700 bg-gray-900/40'} px-2.5 py-2`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-300">📊 Progresión</span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${phase.color} bg-gray-800`}>
            {phase.phase}
          </span>
          {prog.isMaxLevel && (
            <span className="text-xs font-bold text-red-300 animate-pulse">⛔ LÍMITE</span>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-gray-600 hover:text-gray-400">
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Step indicator */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">Step <span className="font-bold text-gray-200">{prog.step}</span> / 20</span>
          <span className={`font-bold ${risk.color}`}>{risk.icon} {risk.label}</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${stepPct}%` }}
          />
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-1.5 text-xs mb-2">
        <div className="rounded bg-gray-800/60 p-1.5 text-center">
          <div className="text-gray-600 text-[10px]">Fichas/nro</div>
          <div className="font-bold text-white text-sm">{prog.chipsPerNumber}</div>
        </div>
        <div className="rounded bg-gray-800/60 p-1.5 text-center">
          <div className="text-gray-600 text-[10px]">Apuesta total</div>
          <div className="font-bold text-blue-300 text-sm">{prog.totalBet}</div>
        </div>
        <div className="rounded bg-gray-800/60 p-1.5 text-center">
          <div className="text-gray-600 text-[10px]">Exp. acum.</div>
          <div className="font-bold text-orange-400 text-sm">{prog.accumulatedExposure}</div>
        </div>
      </div>

      {/* Win/Next step preview */}
      <div className="grid grid-cols-2 gap-1.5 text-xs mb-2">
        <div className="rounded p-1.5 border border-green-800 bg-green-900/10">
          <div className="text-green-500 font-semibold text-[10px]">Si GANA →</div>
          <div className="text-green-300 font-bold">+{prog.winProfit} fchs</div>
          <div className="text-gray-600 text-[10px]">Recupera {prog.accumulatedExposure} acum.</div>
        </div>
        <div className="rounded p-1.5 border border-red-900 bg-red-900/10">
          <div className="text-red-500 font-semibold text-[10px]">Si PIERDE →</div>
          <div className="text-red-300 font-bold">−{prog.totalBet} fchs</div>
          <div className="text-gray-600 text-[10px]">
            {prog.isMaxLevel ? '⛔ Límite alcanzado' : `→ Step ${prog.nextStep} · ${prog.nextStepChips} fch/nro`}
          </div>
        </div>
      </div>

      {/* Session summary */}
      {prog.totalBetSpins > 0 && (
        <div className="flex gap-3 text-xs text-gray-600 border-t border-gray-800 pt-1.5">
          <span>Apuestas: <span className="text-gray-400">{prog.totalBetSpins}</span></span>
          <span>✓ <span className="text-green-400">{prog.wins}</span></span>
          <span>✗ <span className="text-red-400">{prog.losses}</span></span>
          {prog.consecutiveLosses > 2 && (
            <span className="text-orange-400 font-bold ml-auto">{prog.consecutiveLosses}P seguidas</span>
          )}
        </div>
      )}

      {/* Expanded: full step table */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <div className="text-xs text-gray-600 mb-1.5">Tabla completa de progresión:</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-700 border-b border-gray-800">
                  <th className="text-left py-0.5">Step</th>
                  <th className="text-right">Fch/nro</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Exp.</th>
                  <th className="text-right">Si gana</th>
                </tr>
              </thead>
              <tbody>
                {AXIS6_PROGRESSIVE_TABLE.map(entry => {
                  const isCurrent = entry.step === prog.step;
                  const isPast    = entry.step < prog.step;
                  return (
                    <tr
                      key={entry.step}
                      className={`border-b border-gray-900 ${
                        isCurrent ? 'bg-blue-900/30 text-white' :
                        isPast    ? 'opacity-40 text-gray-600' :
                        'text-gray-500'
                      }`}>
                      <td className={`py-0.5 ${isCurrent ? 'font-bold text-blue-300' : ''}`}>
                        {isCurrent ? '▶' : ''}{entry.step}
                      </td>
                      <td className="text-right">{entry.chips}</td>
                      <td className="text-right">{entry.totalBet}</td>
                      <td className={`text-right ${entry.step >= 13 ? 'text-red-400' : entry.step >= 5 ? 'text-orange-400' : 'text-gray-500'}`}>
                        {entry.exposure}
                      </td>
                      <td className="text-right text-green-600">+{entry.expectedProfit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, triggeredH, triggeredV, aceNumber, spinsRemaining }) {
  const spin = spinsRemaining > 0 ? ` · ${4 - spinsRemaining + 1}/4` : '';
  if (status === 'IDLE') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-800 text-gray-500">IDLE</span>
  );
  if (status === 'COOLDOWN') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-900/60 text-purple-300">COOLDOWN</span>
  );
  if (status === 'TRIGGERED_ECLIPSE') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-600 text-black animate-pulse">
      ⭐ ECLIPSE {aceNumber}{spin}
    </span>
  );
  if (status === 'TRIGGERED_H') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-700 text-white">
      ↔ H{triggeredH} ACTIVO{spin}
    </span>
  );
  if (status === 'TRIGGERED_V') return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-700 text-white">
      ↕ V{triggeredV} ACTIVO{spin}
    </span>
  );
  return null;
}

// ─── Memory badge ─────────────────────────────────────────────────────────────
function MemoryBadge({ classification, totalCycles, winrate }) {
  if (!classification || classification === 'NORMAL' || classification === 'UNPLAYED') return null;
  const map = {
    HOT:      { cls: 'bg-green-700/80 text-green-100',   icon: '🔥', label: `HOT ${totalCycles}c ${Math.round((winrate??0)*100)}%` },
    COLD:     { cls: 'bg-red-900/80 text-red-300',       icon: '🥶', label: `COLD ${Math.round((1-(winrate??0))*100)}% abort` },
    SLEEPING: { cls: 'bg-gray-800 text-gray-500',        icon: '😴', label: 'SLEEPING' },
    WAKEUP:   { cls: 'bg-yellow-700/80 text-yellow-200 animate-pulse', icon: '⚡', label: 'WAKEUP' },
  };
  const def = map[classification];
  if (!def) return null;
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${def.cls}`}>
      {def.icon}{def.label}
    </span>
  );
}

// ─── Grid cell ────────────────────────────────────────────────────────────────
function GridCell({ num, rowIdx, colIdx, triggeredH, triggeredV, betNumbers, aceNumber }) {
  const isHRow    = triggeredH !== null && rowIdx === triggeredH - 1;
  const isVCol    = triggeredV !== null && colIdx === triggeredV - 1;
  const isEclipse = isHRow && isVCol && num === aceNumber;
  const isBet     = betNumbers.includes(num);

  let cls = 'bg-gray-800 text-gray-500';
  if (isEclipse)       cls = 'bg-yellow-400 text-black font-black ring-2 ring-yellow-200 scale-105';
  else if (isHRow && isVCol) cls = 'bg-blue-500 text-white font-bold';
  else if (isHRow)     cls = 'bg-blue-800 text-blue-100 font-semibold';
  else if (isVCol)     cls = 'bg-orange-800 text-orange-100 font-semibold';
  else if (isBet)      cls = 'bg-green-800/60 text-green-200';

  return (
    <div className={`rounded text-center text-xs py-1 transition-all duration-200 ${cls}`}>{num}</div>
  );
}

// ─── Sector pill ──────────────────────────────────────────────────────────────
function SectorPill({ label, stat, isActive, activeColor, memoryRow, lastSeenAgo }) {
  const { status: st } = stat ?? { status: 'unplayed' };
  const ago = stat?.lastSeenAgo != null ? `(${stat.lastSeenAgo})` : '';
  const classification = classifyAxisSector(memoryRow, lastSeenAgo ?? stat?.lastSeenAgo ?? null, isActive);

  let cls = 'bg-gray-800 text-gray-500';
  if (isActive)           cls = `${activeColor} text-white font-bold`;
  else if (st === 'hot')  cls = 'bg-green-900 text-green-300';
  else if (st === 'sleeping') cls = 'bg-gray-900 text-gray-700';

  let border = '';
  if (!isActive) {
    if (classification === 'HOT')    border = 'ring-1 ring-green-500';
    else if (classification === 'COLD')   border = 'ring-1 ring-red-700';
    else if (classification === 'WAKEUP') border = 'ring-1 ring-yellow-500 animate-pulse';
  }

  const icon = classification === 'HOT'     ? '🔥'
             : classification === 'COLD'    ? '🥶'
             : classification === 'SLEEPING'? '😴'
             : classification === 'WAKEUP'  ? '⚡'
             : (st === 'hot' ? '🔥' : st === 'sleeping' ? '😴' : '');

  const winrateHint = memoryRow && memoryRow.total_cycles >= 4
    ? ` ${Math.round((memoryRow.wins / memoryRow.total_cycles) * 100)}%`
    : '';

  return (
    <div className={`px-1.5 py-0.5 rounded text-xs font-mono ${cls} ${border}`}
         title={memoryRow ? `Ciclos: ${memoryRow.total_cycles} · Wins: ${memoryRow.wins} · Aborts: ${memoryRow.aborts}` : ''}>
      {icon}{label}<span className="opacity-50 ml-0.5">{ago}</span>
      {winrateHint && <span className="opacity-60 ml-0.5 text-[10px]">{winrateHint}</span>}
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
          <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
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

// ─── Top sectors ─────────────────────────────────────────────────────────────
function TopSectorsPanel({ topSectors }) {
  if (!topSectors?.length) return null;
  return (
    <div className="rounded bg-gray-900/60 p-2 border border-gray-800">
      <div className="text-xs text-gray-600 mb-1.5">🏆 Top sectores históricos:</div>
      {topSectors.map((s, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="font-mono text-gray-400">
            {s.sector_type}{s.sector_type !== 'E' ? s.sector_id : ` ace ${s.sector_id}`}
          </span>
          <div className="flex gap-2 text-gray-500">
            <span>{s.total_cycles}c</span>
            <span className={s.winrate > 0.55 ? 'text-green-400 font-bold' : s.winrate < 0.35 ? 'text-red-400' : ''}>
              {Math.round(s.winrate * 100)}%
            </span>
            <span className="opacity-40">×{s.decay.toFixed(1)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PANEL ───────────────────────────────────────────────────────────────
export default function AxisPanel({ state, memoryRows = [], intelligence = null, spins = [], results = [] }) {
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

  // ── AXIS results for progression ──
  const axisResults = results.filter(r => (r.system_type || r.systemType) === 'AXIS');

  // ── Progression output (memoized) ──
  const betCount  = isActive ? betNumbers.length : 6;
  const progOutput = useMemo(
    () => computeProgressionOutput(axisResults, betCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisResults.length, betCount]
  );

  // ── Series-level lifecycle (correct Ganados / Abortados) ──
  const lifecycle = useMemo(
    () => computeProgressionLifecycle(axisResults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisResults.length]
  );

  // ── Phase 2 memory ──
  const topSectors = getTopAxisSectors(memoryRows, 3);

  // ── Current trigger memory row ──
  let triggerMemRow = null, triggerClassification = null;
  if (status === 'TRIGGERED_ECLIPSE' && aceNumber != null) {
    triggerMemRow = findMemoryRow(memoryRows, 'E', aceNumber);
    triggerClassification = classifyAxisSector(triggerMemRow, null, true);
  } else if (status === 'TRIGGERED_H' && triggeredH != null) {
    triggerMemRow = findMemoryRow(memoryRows, 'H', triggeredH);
    triggerClassification = classifyAxisSector(triggerMemRow, sectorStats?.h?.[triggeredH]?.lastSeenAgo ?? null, true);
  } else if (status === 'TRIGGERED_V' && triggeredV != null) {
    triggerMemRow = findMemoryRow(memoryRows, 'V', triggeredV);
    triggerClassification = classifyAxisSector(triggerMemRow, sectorStats?.v?.[triggeredV]?.lastSeenAgo ?? null, true);
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 tracking-wider">🔷 AXIS Phase 3</span>
        <StatusBadge
          status={status} triggeredH={triggeredH} triggeredV={triggeredV}
          aceNumber={aceNumber} spinsRemaining={spinsRemaining}
        />
      </div>

      {/* ── Confidence + anti-overtrade (Phase 3) ── */}
      {intelligence && (
        <>
          <ConfidenceMeter confidence={intelligence.confidence} antiOvertrade={intelligence.antiOvertrade} />
          <AntiOvertradeWarning antiOvertrade={intelligence.antiOvertrade} />
          {isActive && intelligence.convergence.score > 0 && (
            <ConvergenceBadges convergence={intelligence.convergence} />
          )}
        </>
      )}

      {/* ── 6×6 Grid ── */}
      <div>
        <div className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: 'auto repeat(6, 1fr)' }}>
          <div />
          {[1, 2, 3, 4, 5, 6].map(v => (
            <div key={v} className={`text-center text-xs font-bold py-0.5 rounded ${triggeredV === v ? 'text-orange-400' : 'text-gray-700'}`}>
              V{v}
            </div>
          ))}
        </div>
        {AXIS_GRID.map((row, rowIdx) => (
          <div key={rowIdx} className="grid gap-0.5 mb-0.5" style={{ gridTemplateColumns: 'auto repeat(6, 1fr)' }}>
            <div className={`text-xs font-bold text-center py-1 rounded ${triggeredH === rowIdx + 1 ? 'text-blue-400' : 'text-gray-700'}`}>
              H{rowIdx + 1}
            </div>
            {row.map((num, colIdx) => (
              <GridCell key={colIdx} num={num} rowIdx={rowIdx} colIdx={colIdx}
                triggeredH={triggeredH} triggeredV={triggeredV}
                betNumbers={betNumbers} aceNumber={aceNumber} />
            ))}
          </div>
        ))}
      </div>

      {/* ── Active bet box ── */}
      {isActive && (
        <div className="rounded-xl p-3 border-2 border-green-600 bg-green-900/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-green-400">
                ⚡ APOSTAR
              </span>
              {/* Progression stake badge */}
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-800 text-blue-200 font-bold">
                Step {progOutput.step} · {progOutput.chipsPerNumber} fch/nro · {progOutput.totalBet} total
              </span>
              {triggerClassification && (
                <MemoryBadge
                  classification={triggerClassification}
                  totalCycles={triggerMemRow?.total_cycles ?? 0}
                  winrate={triggerMemRow ? triggerMemRow.wins / triggerMemRow.total_cycles : 0}
                />
              )}
            </div>
            <SpinDots spinsRemaining={spinsRemaining} />
          </div>

          <div className="flex flex-wrap gap-1">
            {betNumbers.map(n => (
              <span key={n} className={`px-2 py-0.5 rounded text-xs font-bold
                ${n === aceNumber ? 'bg-yellow-500 text-black ring-1 ring-yellow-200' : 'bg-green-700 text-green-100'}`}>
                {n === aceNumber ? '⭐' : ''}{n}
              </span>
            ))}
          </div>

          {status === 'TRIGGERED_ECLIPSE' && aceNumber && (
            <div className="text-xs text-yellow-400 mt-1.5 font-semibold">
              ⭐ Ace {aceNumber} = H{triggeredH} × V{triggeredV}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div className="rounded p-1.5 border border-green-700 bg-green-900/10">
              <div className="text-green-400 font-semibold">Si GANA →</div>
              <div className="text-gray-300 font-bold">+{progOutput.winProfit} fichas</div>
              <div className="text-gray-600 text-[10px]">Recupera {progOutput.accumulatedExposure} acum.</div>
            </div>
            <div className="rounded p-1.5 border border-red-800 bg-red-900/10">
              <div className="text-red-400 font-semibold">Si PIERDE →</div>
              <div className="text-gray-300 font-bold">−{progOutput.totalBet} fichas</div>
              <div className="text-gray-600 text-[10px]">
                {progOutput.isMaxLevel
                  ? '⛔ Límite alcanzado'
                  : `→ Step ${progOutput.nextStep} · ${progOutput.nextStepChips} fch/nro`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Progression Panel (always visible when axis is in use) ── */}
      <ProgressionPanel axisResults={axisResults} betCount={betCount} />

      {/* ── IDLE ── */}
      {status === 'IDLE' && (
        <div className="text-center text-gray-600 text-xs py-1 border border-gray-800 rounded">
          Esperando trigger · 2 hits mismo sector en 3 tiradas
        </div>
      )}

      {/* ── Intelligence dashboard (colapsable) ── */}
      <IntelligenceDashboard intelligence={intelligence} />

      {/* ── Sector strips ── */}
      <div className="space-y-1.5">
        <div>
          <div className="text-xs text-gray-600 mb-1">H (arco físico del cilindro):</div>
          <div className="flex gap-1 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(s => (
              <SectorPill key={s} label={`H${s}`} stat={sectorStats?.h?.[s]}
                isActive={triggeredH === s} activeColor="bg-blue-700"
                memoryRow={findMemoryRow(memoryRows, 'H', s)}
                lastSeenAgo={sectorStats?.h?.[s]?.lastSeenAgo ?? null} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600 mb-1">V (color-uniformes):</div>
          <div className="flex gap-1 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(s => (
              <SectorPill key={s} label={`V${s}`} stat={sectorStats?.v?.[s]}
                isActive={triggeredV === s} activeColor="bg-orange-700"
                memoryRow={findMemoryRow(memoryRows, 'V', s)}
                lastSeenAgo={sectorStats?.v?.[s]?.lastSeenAgo ?? null} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Progression Series Lifecycle ── */}
      <LifecyclePanel lifecycle={lifecycle} />

      {/* ── Session analytics (Phase 3) ── */}
      {(intelligence?.sessionAnalytics || lifecycle.totalBetSpins > 0) && (
        <SessionAnalyticsPanel
          analytics={intelligence?.sessionAnalytics}
          lifecycle={lifecycle}
        />
      )}

      {/* ── Top sectores históricos ── */}
      <TopSectorsPanel topSectors={topSectors} />

      {/* ── Backtest (Phase 3) ── */}
      <BacktestPanel spins={spins} />

      {/* ── Engine debug log ── */}
      {debugLog && debugLog.length > 0 && (
        <div className="bg-gray-900 rounded p-2 font-mono">
          <div className="text-xs text-gray-700 mb-1">Log motor:</div>
          {debugLog.slice(-6).map((line, i) => (
            <div key={i} className={`text-xs leading-snug ${
              line.includes('HIT')      ? 'text-green-400' :
              line.includes('expirado') ? 'text-red-400'   :
              line.includes('Eclipse')  ? 'text-yellow-400':
              line.includes('Trigger')  ? 'text-blue-300'  :
              line.includes('Cooldown') ? 'text-purple-400':
              'text-gray-600'}`}>{line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
