// ═══════════════════════════════════════════════════════════════════════════════
// AXIS PRO PANEL — Phase 4
// Dashboard avanzado (colapsable):
//   - signal quality meter
//   - live EV estimator
//   - exposure + bankroll control
//   - strategy ranking
//   - table quality score
//   - performance optimizer hints
//   - drawdown gauge
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import {
  computeSignalQuality,
  computeLiveEV,
  rankStrategies,
  computeTableQualityScore,
  detectPerformanceIssues,
} from '../utils/axisSignalQuality';
import {
  computeDrawdownProtection,
  computeExposureMultiplier,
  computeBankrollRecommendation,
  computeRiskLevel,
  BANKROLL_MODES,
} from '../utils/axisRiskEngine';
import AxisReplayPanel from './AxisReplayPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function MeterBar({ value, max = 100, color = 'bg-blue-500', label, sublabel }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-300 font-bold">{sublabel ?? `${pct}%`}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SectionHeader({ title, badge }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-bold text-gray-400">{title}</span>
      {badge && <span className="text-xs text-gray-600">{badge}</span>}
    </div>
  );
}

// ─── Signal Quality Section ───────────────────────────────────────────────────
function SignalQualitySection({ intelligence }) {
  const sq = intelligence?.signalQuality;
  if (!sq) return null;

  const color = sq.score >= 72 ? 'bg-green-500' : sq.score >= 55 ? 'bg-blue-500'
              : sq.score >= 38 ? 'bg-yellow-500' : 'bg-red-600';

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-2.5">
      <SectionHeader title="📶 Signal Quality" badge={`${sq.score}% — ${sq.label}`} />
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${sq.score}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {Object.entries(sq.breakdown ?? {}).map(([k, v]) => {
          const labels = { persistence:'Persistencia', noise:'Ruido inverso', consistency:'Consistencia', dealerSig:'Firma dealer', abortPenalty:'Penalización' };
          return (
            <div key={k} className="flex justify-between">
              <span className="text-gray-600">{labels[k] ?? k}</span>
              <span className={`font-mono ${k === 'abortPenalty' && v > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {k === 'abortPenalty' ? (v > 0 ? `-${v}` : '0') : `${v}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Wheel Profile Section ────────────────────────────────────────────────────
function WheelProfileSection({ intelligence }) {
  const wp = intelligence?.wheelProfile;
  if (!wp) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
      <span className="text-lg">{wp.icon}</span>
      <div>
        <div className={`text-xs font-bold ${wp.color}`}>
          Wheel: {wp.profile.toUpperCase()}
        </div>
        <div className="text-xs text-gray-600">{wp.desc}</div>
      </div>
    </div>
  );
}

// ─── Live EV Section ──────────────────────────────────────────────────────────
function LiveEVSection({ evData }) {
  if (!evData || evData.n < 5) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
        <SectionHeader title="📈 Live EV" badge="(min 5 apuestas)" />
        <div className="text-xs text-gray-600 text-center py-1">Insuficiente historial</div>
      </div>
    );
  }

  const color = evData.isPositive ? 'text-green-400' : 'text-red-400';
  const trendIcon = evData.trend === 'improving' ? '↗' : evData.trend === 'declining' ? '↘' : '→';
  const trendColor = evData.trend === 'improving' ? 'text-green-400' : evData.trend === 'declining' ? 'text-red-400' : 'text-gray-500';

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-2.5">
      <SectionHeader title="📈 Live EV Estimator" badge={`(últimas ${evData.n} apuestas)`} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-600">EV observado</span>
          <span className={`font-bold font-mono ${color}`}>
            {evData.evPercent >= 0 ? '+' : ''}{evData.evPercent}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">vs. baseline</span>
          <span className={`font-mono ${evData.evVsBaseline >= 0 ? 'text-green-300' : 'text-orange-400'}`}>
            {evData.evVsBaseline >= 0 ? '+' : ''}{evData.evVsBaseline}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Tendencia</span>
          <span className={`font-bold ${trendColor}`}>{trendIcon} {evData.trend}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Profit total</span>
          <span className={evData.totalProfit >= 0 ? 'text-green-300' : 'text-red-300'}>
            {evData.totalProfit >= 0 ? '+' : ''}{evData.totalProfit}
          </span>
        </div>
      </div>
      <div className="mt-1.5 text-xs text-gray-700">
        * baseline europeo: −2.7% · EV positivo = edge operativo observado (no garantizado)
      </div>
    </div>
  );
}

// ─── Drawdown + Risk Section ──────────────────────────────────────────────────
function DrawdownSection({ ddProtection, riskLevel }) {
  if (!ddProtection) return null;
  const { level, label, color, maxDrawdown, message } = {
    ...ddProtection,
    label: { none: '—', caution: 'Precaución', warning: 'Advertencia', critical: 'Crítico' }[ddProtection.level],
    color: { none: 'text-gray-500', caution: 'text-yellow-400', warning: 'text-orange-400', critical: 'text-red-400 font-bold animate-pulse' }[ddProtection.level],
  };

  const bars = { none: 0, caution: 33, warning: 66, critical: 100 };
  const barColor = { none: 'bg-gray-600', caution: 'bg-yellow-500', warning: 'bg-orange-500', critical: 'bg-red-600' };

  return (
    <div className={`rounded-lg border p-2.5 ${ddProtection.level === 'critical' ? 'border-red-700 bg-red-900/10' : 'border-gray-800 bg-gray-900/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-400">🛡 Drawdown Protection</span>
        <span className={`text-xs font-bold ${color}`}>{label}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1.5">
        <div className={`h-full rounded-full ${barColor[ddProtection.level]}`} style={{ width: `${bars[ddProtection.level]}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>Max DD: <span className="text-orange-400">{maxDrawdown} fchs</span></span>
        <span>Exposición: <span className="text-gray-300">×{ddProtection.exposureMultiplier}</span></span>
      </div>
      {message && <div className={`text-xs mt-1.5 ${color}`}>· {message}</div>}
      {riskLevel && (
        <div className={`text-xs mt-1 font-bold ${riskLevel.color}`}>{riskLevel.label}</div>
      )}
    </div>
  );
}

// ─── Bankroll Management Section ──────────────────────────────────────────────
function BankrollSection({ recommendation, bankrollMode, onBankrollModeChange }) {
  if (!recommendation) return null;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-2.5">
      <SectionHeader title="💰 Bankroll Management" />
      <div className="flex gap-1 mb-2">
        {Object.entries(BANKROLL_MODES).map(([mode, info]) => (
          <button key={mode}
            onClick={() => onBankrollModeChange?.(mode)}
            className={`flex-1 text-xs py-0.5 px-1 rounded transition-all ${
              bankrollMode === mode
                ? 'bg-blue-700 text-white'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
            title={info.desc}>
            {mode}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-600 mb-1">{BANKROLL_MODES[bankrollMode]?.desc}</div>
      {recommendation.chips > 0 && (
        <div className="rounded bg-gray-800/60 p-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Stake recomendado</span>
            <span className="text-gray-200 font-bold">
              {recommendation.chips} fichas (×{recommendation.multiplier})
            </span>
          </div>
          {recommendation.note && (
            <div className="text-orange-400 mt-0.5">· {recommendation.note}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Strategy Ranking Section ─────────────────────────────────────────────────
function StrategyRankingSection({ ranked }) {
  if (!ranked || ranked.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
        <SectionHeader title="🏆 Strategy Ranking" />
        <div className="text-xs text-gray-600 text-center py-1">Sin datos suficientes para comparar</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-2.5">
      <SectionHeader title="🏆 Strategy Ranking" badge="(esta sesión)" />
      <div className="space-y-1">
        {ranked.map((s, i) => (
          <div key={s.system} className="flex items-center gap-2 text-xs">
            <span className="text-gray-600 w-4">{i + 1}</span>
            <span className="flex-1 text-gray-400">{s.label}</span>
            <span className="text-gray-600">{s.total}×</span>
            <span className={`w-10 text-right font-mono ${s.winrate >= 55 ? 'text-green-400' : s.winrate <= 35 ? 'text-red-400' : 'text-gray-400'}`}>
              {s.winrate}%
            </span>
            <span className={`w-10 text-right font-bold ${s.roi >= 0 ? 'text-green-300' : 'text-red-300'}`}>
              {s.roi >= 0 ? '+' : ''}{s.roi}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Table Quality Section ────────────────────────────────────────────────────
function TableQualitySection({ tableQuality }) {
  if (!tableQuality) return null;
  const gradeColor = { 'A+': 'text-green-300', A: 'text-green-400', B: 'text-blue-300', C: 'text-gray-400', D: 'text-orange-400', F: 'text-red-400' };
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-2.5 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-400">🎰 Table Quality Score</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{tableQuality.score}/100</span>
          <span className={`text-lg font-black ${gradeColor[tableQuality.grade] ?? 'text-gray-400'}`}>
            {tableQuality.grade}
          </span>
        </div>
      </div>
      {tableQuality.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {tableQuality.tags.map((t, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 text-xs">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Performance Hints Section ────────────────────────────────────────────────
function PerformanceHintsSection({ hints }) {
  if (!hints || hints.issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-yellow-800/50 bg-yellow-900/10 p-2.5">
      <SectionHeader title="⚙ Performance Optimizer" />
      {hints.issues.map((issue, i) => (
        <div key={i} className="text-xs text-yellow-400 mb-0.5">⚠ {issue}</div>
      ))}
      {hints.suggestions.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {hints.suggestions.map((s, i) => (
            <div key={i} className="text-xs text-gray-500">→ {s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AxisProPanel({
  axisState,
  intelligence,
  memoryRows = [],
  results    = [],
  spins      = [],
  bankrollMode = 'flat',
  onBankrollModeChange,
}) {
  const [open, setOpen] = useState(false);

  // ── Computed data (memoized inline via useMemo) ──
  const evData = useMemo(() => computeLiveEV(results), [results]);

  const ranked = useMemo(() => rankStrategies(results), [results]);

  const tableQuality = useMemo(
    () => computeTableQualityScore(memoryRows, intelligence),
    [memoryRows, intelligence]
  );

  const hints = useMemo(
    () => detectPerformanceIssues(axisState, results, intelligence, memoryRows),
    [axisState, results, intelligence, memoryRows]
  );

  const analytics    = intelligence?.sessionAnalytics ?? null;
  const ddProtection = useMemo(() => computeDrawdownProtection(analytics), [analytics]);

  const confidence   = intelligence?.confidence ?? 0;
  const riskLevel    = computeRiskLevel(ddProtection, intelligence?.antiOvertrade, confidence);

  const recommendation = useMemo(() => computeBankrollRecommendation(
    axisState?.betNumbers ?? [],
    ddProtection,
    confidence,
    bankrollMode
  ), [axisState?.betNumbers, ddProtection, confidence, bankrollMode]);

  if (!open) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/20">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-2.5 py-2 text-xs hover:text-gray-300">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-400">🔩 AXIS PRO</span>
            {riskLevel.level !== 'low' && (
              <span className={`font-bold ${riskLevel.color}`}>{riskLevel.label}</span>
            )}
            {intelligence?.signalQuality && (
              <span className="text-gray-600">Signal {intelligence.signalQuality.score}%</span>
            )}
          </div>
          <span className="text-gray-600">▼</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/30">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-800">
        <span className="text-xs font-bold text-gray-300">🔩 AXIS PRO — Dashboard</span>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-600 hover:text-gray-400">▲</button>
      </div>

      <div className="p-2.5 flex flex-col gap-3">
        {/* 1. Wheel profile */}
        <WheelProfileSection intelligence={intelligence} />

        {/* 2. Signal quality */}
        <SignalQualitySection intelligence={intelligence} />

        {/* 3. Drawdown protection */}
        <DrawdownSection ddProtection={ddProtection} riskLevel={riskLevel} />

        {/* 4. Bankroll management */}
        <BankrollSection
          recommendation={recommendation}
          bankrollMode={bankrollMode}
          onBankrollModeChange={onBankrollModeChange}
        />

        {/* 5. Live EV */}
        <LiveEVSection evData={evData} />

        {/* 6. Strategy ranking */}
        <StrategyRankingSection ranked={ranked} />

        {/* 7. Table quality */}
        <TableQualitySection tableQuality={tableQuality} />

        {/* 8. Performance hints */}
        <PerformanceHintsSection hints={hints} />

        {/* 9. Replay timeline */}
        <AxisReplayPanel spins={spins} results={results} />
      </div>
    </div>
  );
}
