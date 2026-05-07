import { useMemo } from 'react';
import { buildCylinderHeatmap, computeWheelBalance } from '../utils/vecinosAnalytics';
import { RED_NUMBERS } from '../utils/roulette';

// ─── Color mapping ─────────────────────────────────────────────────────────────
// heat 0 = cold (blue-gray) → 0.5 = neutral → 1 = hot (red)
function heatToColor(heat) {
  if (heat >= 0.80) return { bg: 'bg-red-600',     text: 'text-white',      border: 'border-red-400'    };
  if (heat >= 0.65) return { bg: 'bg-orange-500',  text: 'text-white',      border: 'border-orange-300'  };
  if (heat >= 0.50) return { bg: 'bg-yellow-600',  text: 'text-white',      border: 'border-yellow-400'  };
  if (heat >= 0.38) return { bg: 'bg-yellow-800',  text: 'text-yellow-100', border: 'border-yellow-700'  };
  if (heat >= 0.28) return { bg: 'bg-gray-700',    text: 'text-gray-200',   border: 'border-gray-600'    };
  return                   { bg: 'bg-gray-800',    text: 'text-gray-500',   border: 'border-gray-700'    };
}

function numberColor(num) {
  if (num === 0) return 'text-green-400';
  return RED_NUMBERS.has(num) ? 'text-red-300' : 'text-gray-200';
}

// ─── Legend ────────────────────────────────────────────────────────────────────
function HeatLegend() {
  return (
    <div className="flex items-center gap-1 text-xs text-gray-500">
      <span>Frío</span>
      {['bg-gray-800','bg-gray-700','bg-yellow-800','bg-yellow-600','bg-orange-500','bg-red-600'].map((c, i) => (
        <div key={i} className={`w-4 h-3 rounded ${c}`} />
      ))}
      <span>Caliente</span>
    </div>
  );
}

// ─── Wheel slot ────────────────────────────────────────────────────────────────
function Slot({ cell, inActiveZone, isCenter }) {
  const { bg, text, border } = heatToColor(cell.heat);
  const numColor = numberColor(cell.num);
  return (
    <div
      className={`flex flex-col items-center justify-center rounded text-xs font-bold border transition-all
        ${bg} ${border}
        ${inActiveZone ? 'ring-1 ring-green-400' : ''}
        ${isCenter ? 'ring-2 ring-green-300 scale-105 z-10' : ''}
      `}
      style={{ minWidth: 22, minHeight: 32, padding: '2px 0' }}
      title={`${cell.num} · z=${cell.z} · raw:${cell.rawCount}`}
    >
      <span className={`text-xs font-black leading-none ${isCenter ? 'text-green-300' : numColor}`}>
        {cell.num}
      </span>
      <span className={`text-xs leading-none mt-0.5 ${text} opacity-70`} style={{ fontSize: 8 }}>
        {cell.z > 0 ? `+${cell.z.toFixed(1)}` : cell.z.toFixed(1)}
      </span>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function CylinderHeatmapVecinos({ spins = [], activeZone = null, halfLife = 30 }) {
  const heatmap  = useMemo(() => buildCylinderHeatmap(spins, halfLife), [spins, halfLife]);
  const balance  = useMemo(() => computeWheelBalance(spins), [spins]);

  const activeSet    = activeZone ? new Set(activeZone.numbers ?? []) : new Set();
  const centerNum    = activeZone?.center ?? null;

  const biasConfig = {
    strong:       { cls: 'border-red-600 bg-red-900/20 text-red-400',    label: '🔥 Sesgo fuerte detectado'    },
    moderate:     { cls: 'border-orange-600 bg-orange-900/20 text-orange-400', label: '⚡ Sesgo moderado'        },
    weak:         { cls: 'border-yellow-700 bg-yellow-900/20 text-yellow-400', label: '📊 Sesgo leve'            },
    uniform:      { cls: 'border-gray-700 bg-gray-800/40 text-gray-400',  label: '〰 Distribución uniforme'     },
    insufficient: { cls: 'border-gray-700 bg-gray-800/40 text-gray-500',  label: '⏳ Datos insuficientes'       },
  };
  const biasCfg = biasConfig[balance.biasLevel] ?? biasConfig.insufficient;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="card-title mb-0">🌡 Heatmap del Cilindro</span>
        {spins.length > 0 && (
          <span className="text-xs text-gray-500">decay τ={halfLife} tiradas</span>
        )}
      </div>

      {/* ── Balance global del cilindro ── */}
      <div className={`rounded-lg px-3 py-2 border text-xs flex items-center justify-between ${biasCfg.cls}`}>
        <span className="font-bold">{biasCfg.label}</span>
        {balance.chi2 > 0 && (
          <span className="opacity-70">χ²={balance.chi2.toFixed(1)} · {spins.length} tiradas</span>
        )}
      </div>

      {/* ── Cilindro lineal ── */}
      {spins.length === 0 ? (
        <div className="text-center text-gray-500 text-xs py-4">
          Registrá tiradas para ver el mapa térmico
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-0.5 min-w-max">
            {heatmap.map((cell) => (
              <Slot
                key={cell.pos}
                cell={cell}
                inActiveZone={activeSet.has(cell.num)}
                isCenter={cell.num === centerNum}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Leyenda ── */}
      <HeatLegend />

      {/* ── Top hot / cold ── */}
      {balance.topHot?.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-gray-500 mb-1">Más calientes (z)</div>
            <div className="flex flex-wrap gap-1">
              {balance.topHot.map(({ num, z }) => (
                <span key={num} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-900/30 border border-red-800 text-red-300">
                  <span className={`font-bold ${numberColor(num)}`}>{num}</span>
                  <span className="opacity-60">+{z.toFixed(1)}σ</span>
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Más fríos (z)</div>
            <div className="flex flex-wrap gap-1">
              {balance.topCold.map(({ num, z }) => (
                <span key={num} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-900/30 border border-blue-800 text-blue-300">
                  <span className={`font-bold ${numberColor(num)}`}>{num}</span>
                  <span className="opacity-60">{z.toFixed(1)}σ</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Zona activa info ── */}
      {activeZone && (
        <div className="rounded-lg px-3 py-2 border border-green-700 bg-green-900/20 text-xs">
          <span className="text-green-400 font-bold">Zona activa: </span>
          <span className="text-gray-300">
            centro <strong className="text-green-300">{centerNum}</strong> · {activeZone.numbers?.length ?? 9} números marcados
          </span>
        </div>
      )}
    </div>
  );
}
