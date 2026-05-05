import { useState, useMemo, useCallback } from 'react';
import { api } from '../utils/api';
import { RED_NUMBERS } from '../utils/roulette';

// ─── Constants ────────────────────────────────────────────────────────────────
const THEORETICAL_PCT = 100 / 37;           // 2.7027…%
const BIAS_MIN_SPINS  = 5000;               // mínimo para alertar sesgo
const BIAS_THRESHOLD  = 1.0;               // desviación significativa (%)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function numBg(n) {
  if (n === 0) return 'bg-green-700';
  return RED_NUMBERS.has(n) ? 'bg-red-700' : 'bg-gray-700';
}

function deviationStyle(dev) {
  if (dev >=  1.5) return { bar: 'bg-green-500',  text: 'text-green-400',  label: '▲▲' };
  if (dev >=  0.5) return { bar: 'bg-green-700',  text: 'text-green-600',  label: '▲'  };
  if (dev <= -1.5) return { bar: 'bg-red-500',    text: 'text-red-400',    label: '▼▼' };
  if (dev <= -0.5) return { bar: 'bg-red-700',    text: 'text-red-600',    label: '▼'  };
  return              { bar: 'bg-orange-600', text: 'text-gray-400',   label: '—'  };
}

function qualityBadge(totalSpins) {
  if (totalSpins >= BIAS_MIN_SPINS)
    return { icon: '✅', label: 'Muestra robusta',      cls: 'bg-green-900/40 text-green-400 border border-green-800'  };
  if (totalSpins >= 500)
    return { icon: '⚠️', label: 'Muestra media',        cls: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' };
  return   { icon: '❌', label: 'Muestra insuficiente', cls: 'bg-red-900/40 text-red-400 border border-red-800'       };
}

// ─── Single number row ────────────────────────────────────────────────────────
function NumberRow({ row, maxHits }) {
  const pct  = maxHits > 0 ? (row.hits / maxHits) * 100 : 0;
  const ds   = deviationStyle(row.deviation);
  const sign = row.deviation >= 0 ? '+' : '';

  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Number badge */}
      <span className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold shrink-0 ${numBg(row.number)}`}>
        {row.number}
      </span>

      {/* Bar */}
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${ds.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 shrink-0 text-xs text-right">
        <span className="text-gray-300 w-12">{row.percentage.toFixed(1)}%</span>
        <span className={`w-14 font-semibold ${ds.text}`}>
          {sign}{row.deviation.toFixed(2)}%
        </span>
        <span className="text-gray-600 w-5 text-center">{ds.label}</span>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function TableMemoryPanel({ tableId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [loaded, setLoaded]   = useState(false);
  const [sortBy, setSortBy]   = useState('deviation');   // 'deviation' | 'frequency' | 'number'
  const [showAll, setShowAll] = useState(false);

  // ── Load on demand ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!tableId) return;
    setLoading(true);
    setError('');
    try {
      const d = await api.getTableMemory(tableId);
      setData(d);
      setLoaded(true);
    } catch (e) {
      setError('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  const refresh = useCallback(() => {
    setLoaded(false);
    setData(null);
    load();
  }, [load]);

  // ── Sorted numbers ──────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!data) return [];
    const rows = [...data.numbers];
    if (sortBy === 'frequency') return rows.sort((a, b) => b.hits - a.hits);
    if (sortBy === 'deviation') return rows.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
    return rows.sort((a, b) => a.number - b.number);
  }, [data, sortBy]);

  const displayed = showAll ? sorted : sorted.slice(0, 15);
  const maxHits   = sorted[0]?.hits ?? 1;

  // ── Bias alert — solo con muestra robusta ───────────────────────────────────
  const biasNumbers = useMemo(() => {
    if (!data || data.totalSpins < BIAS_MIN_SPINS) return [];
    return data.numbers.filter(r => Math.abs(r.deviation) >= BIAS_THRESHOLD);
  }, [data]);

  // ── Render — not loaded yet ─────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="card">
        <div className="card-title flex items-center gap-2">
          🧠 Memoria histórica de la mesa
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Acumula datos de todas las sesiones jugadas en esta mesa.
        </p>
        <button
          onClick={load}
          disabled={loading || !tableId}
          className="btn-primary w-full text-sm disabled:opacity-40"
        >
          {loading ? 'Cargando...' : '📊 Cargar memoria histórica'}
        </button>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  // ── Render — empty ──────────────────────────────────────────────────────────
  if (!data || data.totalSpins === 0) {
    return (
      <div className="card">
        <div className="card-title">🧠 Memoria histórica de la mesa</div>
        <div className="text-center py-4">
          <p className="text-sm text-gray-400 mb-1">Sin datos históricos aún</p>
          <p className="text-xs text-gray-600">
            Se registra cada 36 tiradas completadas.
          </p>
        </div>
      </div>
    );
  }

  const quality = qualityBadge(data.totalSpins);

  return (
    <div className="card">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">🧠 Memoria histórica de la mesa</div>
        <button onClick={refresh} className="btn-ghost text-xs" disabled={loading}>
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* ── Stats summary ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white">{data.totalSpins.toLocaleString()}</div>
          <div className="text-xs text-gray-500">tiradas totales</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white">{data.totalBlocks}</div>
          <div className="text-xs text-gray-500">bloques de 36</div>
        </div>
      </div>

      {/* ── Quality indicator ── */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold mb-3 ${quality.cls}`}>
        <span>{quality.icon}</span>
        <span>{quality.label}</span>
        <span className="ml-auto opacity-60">
          {data.totalSpins < BIAS_MIN_SPINS
            ? `${(BIAS_MIN_SPINS - data.totalSpins).toLocaleString()} para análisis robusto`
            : 'Análisis de sesgo activo'}
        </span>
      </div>

      {/* ── Bias alert ── */}
      {biasNumbers.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 mb-3">
          <div className="text-xs font-bold text-amber-400 mb-1">
            ⚠️ Comportamiento estadísticamente atípico
          </div>
          <div className="text-xs text-amber-300/80 mb-2">
            Los siguientes números muestran desviación significativa ({'>'}±{BIAS_THRESHOLD}%)
            respecto a la frecuencia teórica europea (2.70%).
            Esto puede deberse a variación estadística normal.
          </div>
          <div className="flex flex-wrap gap-1">
            {biasNumbers.map(r => (
              <span key={r.number} className={`px-2 py-0.5 rounded text-xs font-bold ${numBg(r.number)}`}>
                {r.number} ({r.deviation >= 0 ? '+' : ''}{r.deviation.toFixed(1)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Sort controls ── */}
      <div className="flex gap-1 mb-3">
        {[
          { key: 'deviation',  label: 'Desviación' },
          { key: 'frequency',  label: 'Frecuencia' },
          { key: 'number',     label: 'Número'     },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              sortBy === key
                ? 'bg-blue-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Column headers ── */}
      <div className="flex items-center gap-2 mb-1 px-0.5">
        <span className="w-7 shrink-0" />
        <span className="flex-1 text-xs text-gray-600 uppercase tracking-wider">Número</span>
        <span className="text-xs text-gray-600 uppercase tracking-wider w-12 text-right">Real</span>
        <span className="text-xs text-gray-600 uppercase tracking-wider w-14 text-right">Desv.</span>
        <span className="w-5" />
      </div>

      {/* ── Theoretical reference line ── */}
      <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
        <span className="w-3 h-0.5 bg-gray-600 inline-block" />
        Teórico europeo: {THEORETICAL_PCT.toFixed(2)}%
      </div>

      {/* ── Number list ── */}
      <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto pr-1">
        {displayed.map(row => (
          <NumberRow key={row.number} row={row} maxHits={maxHits} />
        ))}
      </div>

      {/* ── Show all toggle ── */}
      {sorted.length > 15 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full mt-2 text-xs text-gray-500 hover:text-gray-300 py-1 border-t border-gray-800 transition-colors"
        >
          {showAll
            ? '▲ Mostrar menos'
            : `▼ Ver todos los ${sorted.length} números`}
        </button>
      )}
    </div>
  );
}
