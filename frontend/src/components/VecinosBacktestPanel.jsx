import { useState, useMemo } from 'react';
import { runVecinosBacktest } from '../utils/vecinosAnalytics';
import { findHotZone, VECINOS_PROGRESSION } from '../utils/vecinos';

// ─── Metric card ──────────────────────────────────────────────────────────────
function Metric({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2.5 text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-xl font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Mini result bar ──────────────────────────────────────────────────────────
function ResultBar({ wins, losses }) {
  const total = wins + losses;
  if (total === 0) return null;
  const winPct = (wins / total) * 100;
  return (
    <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
      <div className="bg-green-500 h-full rounded-l-full transition-all" style={{ width: `${winPct}%` }} />
      <div className="bg-red-600 h-full flex-1 rounded-r-full" />
    </div>
  );
}

// ─── Bet history mini-row ─────────────────────────────────────────────────────
function BetRow({ b }) {
  return (
    <div className={`flex items-center justify-between px-2 py-1 rounded text-xs ${b.isWin ? 'bg-green-900/20' : 'bg-red-900/10'}`}>
      <span className="text-gray-500 w-8">#{b.spinIndex}</span>
      <span className="font-mono text-gray-300 w-6 text-center">{b.number}</span>
      <span className="text-gray-500">p{b.step}</span>
      <span className="text-gray-500">{b.chips}f</span>
      <span className={`font-bold w-12 text-right ${b.isWin ? 'text-green-400' : 'text-red-400'}`}>
        {b.profit > 0 ? '+' : ''}{b.profit}
      </span>
      <span className={`font-mono w-14 text-right ${b.balanceAfter >= 0 ? 'text-gray-300' : 'text-red-300'}`}>
        Σ{b.balanceAfter >= 0 ? '+' : ''}{b.balanceAfter}
      </span>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function VecinosBacktestPanel({ spins = [] }) {
  const [expanded, setExpanded] = useState(false);

  const result = useMemo(() => {
    if (spins.length < 20) return null;
    return runVecinosBacktest(spins, VECINOS_PROGRESSION, findHotZone);
  }, [spins]);

  if (!result) {
    return (
      <div className="card">
        <div className="card-title">📊 Backtester VECINOS</div>
        <div className="text-xs text-gray-500 text-center py-3">
          Registrá más de 20 tiradas para ver el análisis histórico
        </div>
      </div>
    );
  }

  const profitColor = result.totalProfit > 0 ? 'text-green-400' : result.totalProfit < 0 ? 'text-red-400' : 'text-gray-300';
  const roiColor    = result.roi > 0 ? 'text-green-400' : result.roi < 0 ? 'text-red-400' : 'text-gray-300';

  const expectedHitRate = (9 / 37 * 100).toFixed(1); // 24.3%

  return (
    <div className="card flex flex-col gap-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <span className="card-title mb-0">📊 Backtester VECINOS</span>
        <span className="text-xs text-gray-600">{spins.length} tiradas</span>
      </div>

      {/* ── Disclaimer ── */}
      <div className="text-xs text-gray-600 border border-gray-800 rounded px-2 py-1.5">
        ⚠️ Descriptivo: muestra el P&L histórico si hubieras aplicado VECINOS en esta sesión. No predice resultados futuros.
      </div>

      {/* ── Metrics grid ── */}
      {result.totalBets === 0 ? (
        <div className="text-center text-gray-500 text-sm py-4">
          Sin apuestas registradas — la calidad mínima no se alcanzó en esta sesión
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Apuestas" value={result.totalBets} sub={`${result.wins}G · ${result.losses}P`} />
            <Metric
              label="Hit rate"
              value={`${(result.hitRate * 100).toFixed(1)}%`}
              sub={`esp. ${expectedHitRate}%`}
              color={result.hitRate > 9/37 ? 'text-green-400' : 'text-orange-400'}
            />
            <Metric
              label="P&L total"
              value={`${result.totalProfit > 0 ? '+' : ''}${result.totalProfit}f`}
              sub={`wagered ${result.totalWagered}f`}
              color={profitColor}
            />
            <Metric
              label="ROI"
              value={`${result.roi > 0 ? '+' : ''}${result.roi}%`}
              sub="sobre fichas apostadas"
              color={roiColor}
            />
            <Metric
              label="Max drawdown"
              value={`${result.maxDrawdown}f`}
              sub="desde pico hasta valle"
              color={result.maxDrawdown > 100 ? 'text-red-400' : 'text-yellow-400'}
            />
            <Metric
              label="Pico"
              value={`+${result.peakBalance}f`}
              sub="máximo histórico"
              color={result.peakBalance > 0 ? 'text-green-400' : 'text-gray-400'}
            />
          </div>

          {/* ── Win/Loss bar ── */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{result.wins} ganadas</span>
              <span>{result.losses} perdidas</span>
            </div>
            <ResultBar wins={result.wins} losses={result.losses} />
          </div>

          {/* ── Interpretation note ── */}
          <div className={`text-xs rounded px-2 py-1.5 border ${
            result.hitRate > 9/37
              ? 'border-green-800 bg-green-900/10 text-green-400'
              : 'border-orange-800 bg-orange-900/10 text-orange-400'
          }`}>
            {result.hitRate > 9/37
              ? `Hit rate ${(result.hitRate * 100).toFixed(1)}% > esperado ${expectedHitRate}% — posible sesgo de cilindro en esta sesión`
              : `Hit rate ${(result.hitRate * 100).toFixed(1)}% ≤ esperado ${expectedHitRate}% — no se detectó ventaja en esta sesión`
            }
          </div>

          {/* ── Bet history ── */}
          <div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full text-xs text-gray-500 hover:text-gray-300 text-left flex items-center gap-1 py-1"
            >
              {expanded ? '▼' : '▶'} Detalle de apuestas ({result.bets.length})
            </button>
            {expanded && (
              <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto mt-1">
                <div className="flex items-center gap-2 px-2 text-xs text-gray-600 mb-1">
                  <span className="w-8">Spin</span>
                  <span className="w-6 text-center">Núm</span>
                  <span>Paso</span>
                  <span>Fichas</span>
                  <span className="ml-auto">P&L</span>
                  <span className="w-14 text-right">Balance</span>
                </div>
                {result.bets.map((b, i) => <BetRow key={i} b={b} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
