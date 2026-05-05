import { useState, useCallback } from 'react';
import { api } from '../utils/api';
import { RED_NUMBERS } from '../utils/roulette';

const WINDOW_SIZE = 36;
const TOP_N = 5;

function numColor(n) {
  if (n === 0) return 'bg-green-700 text-white';
  return RED_NUMBERS.has(n) ? 'bg-red-700 text-white' : 'bg-gray-800 text-white';
}

// ── Single row in the frequency list ─────────────────────────────────────────
function FreqRow({ num, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      {/* Number badge */}
      <span className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold shrink-0 ${numColor(num)}`}>
        {num}
      </span>

      {/* Bar */}
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full bg-orange-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Count */}
      <span className="text-xs text-gray-300 w-14 text-right shrink-0">
        {count}x <span className="text-gray-500">({pct}%)</span>
      </span>
    </div>
  );
}

// ── Historic block ────────────────────────────────────────────────────────────
function HistoricBlock({ block }) {
  const top = block.numbers.slice(0, TOP_N);
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="text-xs font-semibold text-gray-400 mb-2">
        Bloque #{block.window_index}
      </div>
      <div className="flex flex-wrap gap-1">
        {top.map(({ num, count }) => (
          <span key={num} className={`px-2 py-0.5 rounded text-xs font-bold ${numColor(num)}`}>
            {num} <span className="opacity-70">({count})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function HotNumbersPanel({ hotNumbers, spinsCount, tableId }) {
  const [showHistoric, setShowHistoric] = useState(false);
  const [historic, setHistoric]         = useState([]);
  const [loadingH, setLoadingH]         = useState(false);
  const [errorH, setErrorH]             = useState('');

  const handleToggleHistoric = useCallback(async () => {
    if (showHistoric) {
      setShowHistoric(false);
      return;
    }
    if (!tableId) return;
    setShowHistoric(true);
    setLoadingH(true);
    setErrorH('');
    try {
      const data = await api.getHotWindows(tableId);
      setHistoric(data);
    } catch (e) {
      setErrorH('Error cargando histórico: ' + e.message);
    } finally {
      setLoadingH(false);
    }
  }, [showHistoric, tableId]);

  const ready    = spinsCount >= WINDOW_SIZE;
  const top      = hotNumbers.slice(0, TOP_N);
  const maxCount = top[0]?.count ?? 1;

  // Progress towards next window
  const progress  = spinsCount % WINDOW_SIZE;
  const pctFill   = ready ? 100 : Math.round((progress / WINDOW_SIZE) * 100);
  const remaining = WINDOW_SIZE - progress;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0 flex items-center gap-2">
          🔥 Hot Numbers (últimos {WINDOW_SIZE})
          {ready && (
            <span className="badge bg-orange-900 text-orange-300 normal-case tracking-normal">
              {spinsCount} tiradas
            </span>
          )}
        </div>

        {tableId && (
          <button
            onClick={handleToggleHistoric}
            className="btn-ghost text-xs"
            disabled={loadingH}
          >
            {loadingH ? '...' : showHistoric ? '▲ Cerrar' : '📋 Histórico'}
          </button>
        )}
      </div>

      {/* Progress bar until first window */}
      {!ready && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Esperando {WINDOW_SIZE} tiradas...</span>
            <span>{remaining} restantes</span>
          </div>
          <div className="bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-orange-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${pctFill}%` }}
            />
          </div>
        </div>
      )}

      {/* Frequency list */}
      {ready ? (
        <div className="flex flex-col gap-2">
          {top.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">Sin datos</p>
          ) : (
            top.map(({ num, count }) => (
              <FreqRow key={num} num={num} count={count} max={maxCount} />
            ))
          )}
        </div>
      ) : (
        top.length > 0 && (
          <div className="flex flex-col gap-2 opacity-60">
            {top.map(({ num, count }) => (
              <FreqRow key={num} num={num} count={count} max={maxCount} />
            ))}
          </div>
        )
      )}

      {/* Window completion indicator */}
      {ready && progress > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Próximo bloque en</span>
            <span>{remaining} tiradas</span>
          </div>
          <div className="bg-gray-800 rounded-full h-1">
            <div
              className="bg-orange-800 h-1 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((progress / WINDOW_SIZE) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Historic section */}
      {showHistoric && (
        <div className="mt-4 pt-3 border-t border-gray-800">
          <div className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">
            Bloques guardados
          </div>
          {errorH && <p className="text-xs text-red-400 mb-2">{errorH}</p>}
          {!loadingH && historic.length === 0 && !errorH && (
            <p className="text-xs text-gray-500 text-center py-2">
              No hay bloques guardados aún.
              <br />
              Se guardan cada 36 tiradas.
            </p>
          )}
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {[...historic].reverse().map(block => (
              <HistoricBlock key={block.window_index} block={block} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
