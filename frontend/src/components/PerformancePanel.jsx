import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid
} from 'recharts';

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, colorClass = 'text-white' }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 flex flex-col gap-0.5">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-xl font-black ${colorClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

// ─── Result pill ──────────────────────────────────────────────────────────────
function Pill({ r }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black
      ${r === 'win' ? 'bg-green-600 text-white' : 'bg-red-700 text-white'}`}>
      {r === 'win' ? 'G' : 'P'}
    </span>
  );
}

// ─── Custom tooltip for chart ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs shadow-lg">
      <div className="text-gray-400">Jugada #{label}</div>
      <div className={`font-bold ${v >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {v >= 0 ? '+' : ''}{v} fichas
      </div>
    </div>
  );
}

export default function PerformancePanel({ results, summary }) {
  const [expanded, setExpanded] = useState(true);

  const hasData = results && results.length > 0;

  // Build equity curve data
  const equityData = hasData ? results.map((r, i) => ({
    idx: i + 1,
    balance: r.balance_after,
    result: r.result
  })) : [];

  // Insert starting point
  if (equityData.length > 0) equityData.unshift({ idx: 0, balance: 0 });

  const profit = summary?.total_profit ?? 0;
  const roi = summary?.roi ?? 0;
  const winRate = summary?.win_rate ?? 0;
  const totalBets = summary?.total_bets ?? 0;
  const totalWagered = summary?.total_wagered ?? 0;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="card-title mb-0">💰 Performance del Sistema</span>
        <button onClick={() => setExpanded(e => !e)} className="btn-ghost text-xs">
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {!hasData ? (
        <p className="text-gray-500 text-sm text-center py-3">
          Las métricas aparecen cuando hay apuestas registradas
        </p>
      ) : (
        <>
          {/* ── Key stats grid ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatCard
              label="Balance"
              value={`${profit >= 0 ? '+' : ''}${profit}`}
              sub="fichas acumuladas"
              colorClass={profit >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="ROI"
              value={`${roi >= 0 ? '+' : ''}${roi}%`}
              sub={`de ${totalWagered} apostadas`}
              colorClass={roi >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="Win Rate"
              value={`${winRate}%`}
              sub={`${summary?.wins ?? 0}G / ${summary?.losses ?? 0}P`}
              colorClass={winRate >= 50 ? 'text-blue-400' : 'text-orange-400'}
            />
            <StatCard
              label="Jugadas"
              value={totalBets}
              sub="apuestas totales"
              colorClass="text-gray-200"
            />
            <StatCard
              label="Total apostado"
              value={totalWagered}
              sub="fichas arriesgadas"
              colorClass="text-gray-200"
            />
            <StatCard
              label="Balance actual"
              value={`${profit >= 0 ? '+' : ''}${summary?.current_balance ?? 0}`}
              sub="última jugada"
              colorClass={profit >= 0 ? 'text-green-400' : 'text-red-400'}
            />
          </div>

          {expanded && (
            <>
              {/* ── Equity curve ── */}
              <div>
                <div className="text-xs text-gray-400 mb-2">📈 Curva de capital acumulado</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={equityData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="idx" tick={{ fontSize: 9, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#60a5fa' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* ── Recent results history ── */}
              <div>
                <div className="text-xs text-gray-400 mb-2">Historial de jugadas (últimas 30)</div>
                <div className="flex flex-wrap gap-1">
                  {results.slice(-30).map((r, i) => (
                    <Pill key={r.id ?? i} r={r.result} />
                  ))}
                </div>
              </div>

              {/* ── Detailed results table (last 10) ── */}
              <div>
                <div className="text-xs text-gray-400 mb-2">Detalle últimas 10 jugadas</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-1 pr-2">#</th>
                        <th className="text-left py-1 pr-2">Nº</th>
                        <th className="text-left py-1 pr-2">Sist.</th>
                        <th className="text-left py-1 pr-2">Sect.</th>
                        <th className="text-left py-1 pr-2">Fich.</th>
                        <th className="text-left py-1 pr-2">Res.</th>
                        <th className="text-right py-1">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(-10).map((r, i) => (
                        <tr key={r.id ?? i} className="border-b border-gray-800/50">
                          <td className="py-1 pr-2 text-gray-500">{r.spin_index + 1}</td>
                          <td className="py-1 pr-2 font-mono font-bold text-gray-300">{r.number}</td>
                          <td className="py-1 pr-2 text-gray-400">{r.system_type}</td>
                          <td className="py-1 pr-2 text-blue-400">
                            {Array.isArray(r.bet_sectors) ? r.bet_sectors.join('+') : '—'}
                          </td>
                          <td className="py-1 pr-2 text-gray-400">{r.bet_chips}</td>
                          <td className="py-1 pr-2">
                            <span className={`font-bold ${r.result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                              {r.result === 'win' ? 'G' : 'P'}
                            </span>
                          </td>
                          <td className={`py-1 text-right font-mono font-bold ${r.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {r.profit >= 0 ? '+' : ''}{r.profit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
