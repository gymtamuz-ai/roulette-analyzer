import { useState } from 'react';
import { RED_NUMBERS, calculateBiasMetrics, WHEEL_ORDER } from '../utils/roulette';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';

function NumChip({ n, small }) {
  const base = n === 0 ? 'bg-green-800 text-green-200' : RED_NUMBERS.has(n) ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-200';
  const size = small ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  return <span className={`inline-flex items-center justify-center rounded-full font-bold ${base} ${size}`}>{n}</span>;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].value;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
      <div className="font-bold text-white">Nº {label}</div>
      <div className={d >= 0 ? 'text-red-400' : 'text-blue-400'}>{d >= 0 ? '+' : ''}{d.toFixed(1)}%</div>
    </div>
  );
};

export default function BiasPanel({ spins }) {
  const [expanded, setExpanded] = useState(false);

  const metrics = calculateBiasMetrics(spins || []);
  const { n, expected, freq, deviations, chiSquare, hotNumbers, coldNumbers, quality } = metrics;

  const chartData = Array.from({ length: 37 }, (_, i) => ({
    num: i,
    dev: deviations ? parseFloat((deviations[i] || 0).toFixed(1)) : 0,
    freq: freq?.[i] || 0
  }));

  // Significant threshold: ±30% deviation
  const alertNums = chartData.filter(d => Math.abs(d.dev) > 30 && n >= 300);

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="card-title mb-0">📈 Análisis de Sesgo del Cilindro</span>
        <button onClick={() => setExpanded(e => !e)} className="btn-ghost text-xs">
          {expanded ? '▲ Colapsar' : '▼ Expandir'}
        </button>
      </div>

      {/* Quality indicator */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
        quality.level === 0 ? 'border-red-800 bg-red-900/20' :
        quality.level === 1 ? 'border-yellow-800 bg-yellow-900/20' :
        quality.level === 2 ? 'border-green-800 bg-green-900/20' :
        'border-orange-600 bg-orange-900/20'
      }`}>
        <span className="text-2xl">{quality.emoji}</span>
        <div>
          <div className={`font-bold text-sm ${quality.tw}`}>{quality.label}</div>
          <div className="text-gray-400 text-xs">
            {n} tiradas totales · Esperado por nº: {expected?.toFixed(1) || '—'}
            {chiSquare !== undefined && n >= 300 ? ` · χ² = ${chiSquare.toFixed(1)}` : ''}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alertNums.length > 0 && (
        <div className="bg-orange-900/30 border border-orange-700 rounded-lg p-3">
          <div className="text-orange-400 font-semibold text-xs mb-2">⚠️ Anomalías detectadas (desviación &gt;30%)</div>
          <div className="flex flex-wrap gap-1">
            {alertNums.map(({ num, dev }) => (
              <div key={num} className="flex items-center gap-1">
                <NumChip n={num} small />
                <span className={`text-xs font-bold ${dev > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                  {dev > 0 ? '+' : ''}{dev.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hot/Cold summary */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-red-400 font-semibold mb-2">🔥 Más frecuentes</div>
          <div className="space-y-1">
            {(hotNumbers || []).map(({ number, frequency, deviation }) => (
              <div key={number} className="flex items-center gap-2">
                <NumChip n={number} small />
                <div className="flex-1">
                  <div className="text-xs text-gray-300">{frequency}x</div>
                  <div className="text-xs text-red-400">+{deviation?.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-blue-400 font-semibold mb-2">❄️ Menos frecuentes</div>
          <div className="space-y-1">
            {(coldNumbers || []).map(({ number, frequency, deviation }) => (
              <div key={number} className="flex items-center gap-2">
                <NumChip n={number} small />
                <div className="flex-1">
                  <div className="text-xs text-gray-300">{frequency}x</div>
                  <div className="text-xs text-blue-400">{deviation?.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deviation chart (expanded) */}
      {expanded && n > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-2">Desviación por número vs. probabilidad teórica</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis dataKey="num" tick={{ fontSize: 8, fill: '#6b7280' }} interval={2} />
              <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#374151" />
              <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={-30} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.5} />
              <Bar dataKey="dev" radius={[2, 2, 0, 0]}>
                {chartData.map(({ num, dev }) => (
                  <Cell key={num} fill={dev > 30 ? '#ef4444' : dev > 0 ? '#f87171' : dev < -30 ? '#3b82f6' : '#60a5fa'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-xs text-gray-500 mt-1">
            <span><span className="text-red-400">─ ─</span> +30% umbral</span>
            <span><span className="text-blue-400">─ ─</span> -30% umbral</span>
          </div>
        </div>
      )}
    </div>
  );
}
