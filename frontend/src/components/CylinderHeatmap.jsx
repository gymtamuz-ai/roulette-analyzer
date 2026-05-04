import { useState } from 'react';
import { WHEEL_ORDER, RED_NUMBERS, CYLINDER_SECTORS } from '../utils/roulette';

const CX = 160, CY = 160, R_OUTER = 148, R_INNER = 80, R_LABEL = 118;
const N = WHEEL_ORDER.length;
const ANGLE_STEP = (2 * Math.PI) / N;

// Lookup: number → cylinder sector
const CYL_MAP = {};
for (const n of CYLINDER_SECTORS.s0)     CYL_MAP[n] = 'S0';
for (const n of CYLINDER_SECTORS.s5)     CYL_MAP[n] = 'S5';
for (const n of CYLINDER_SECTORS.orphans) CYL_MAP[n] = 'ORF';

function segPath(idx) {
  const a1 = idx * ANGLE_STEP - Math.PI / 2;
  const a2 = (idx + 1) * ANGLE_STEP - Math.PI / 2;
  return [
    `M ${CX + R_OUTER * Math.cos(a1)} ${CY + R_OUTER * Math.sin(a1)}`,
    `A ${R_OUTER} ${R_OUTER} 0 0 1 ${CX + R_OUTER * Math.cos(a2)} ${CY + R_OUTER * Math.sin(a2)}`,
    `L ${CX + R_INNER * Math.cos(a2)} ${CY + R_INNER * Math.sin(a2)}`,
    `A ${R_INNER} ${R_INNER} 0 0 0 ${CX + R_INNER * Math.cos(a1)} ${CY + R_INNER * Math.sin(a1)}`,
    'Z'
  ].join(' ');
}

function labelPos(idx) {
  const a = (idx + 0.5) * ANGLE_STEP - Math.PI / 2;
  return { lx: CX + R_LABEL * Math.cos(a), ly: CY + R_LABEL * Math.sin(a) };
}

// Base color: roulette color + cylinder sector tint
function baseColor(n, showCylinder) {
  if (!showCylinder) {
    if (n === 0) return '#16a34a';
    return RED_NUMBERS.has(n) ? '#991b1b' : '#1f2937';
  }
  // Cylinder sector overlay
  const sec = CYL_MAP[n];
  if (sec === 'S0') return '#1e3a5f';  // blue tint for sector 0
  if (sec === 'S5') return '#3b1f2b';  // rose tint for sector 5
  return '#1c1917';                     // dark for orphans
}

function heatOverlay(freq, maxFreq, totalSpins, n) {
  if (!totalSpins || maxFreq === 0) return 0.55;
  const expected = totalSpins / 37;
  const heat = freq / maxFreq;
  return 0.35 + heat * 0.65;
}

export default function CylinderHeatmap({ frequencies, totalSpins }) {
  const [hovered, setHovered] = useState(null);
  const [showCylinder, setShowCylinder] = useState(false);

  const maxFreq = frequencies ? Math.max(...Object.values(frequencies)) : 0;
  const expected = totalSpins ? totalSpins / 37 : 0;

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="card-title mb-0">🎡 Cilindro</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCylinder(c => !c)}
            className={`text-xs px-2 py-0.5 rounded border transition-all ${showCylinder ? 'bg-blue-700 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
          >
            {showCylinder ? 'Sectores físicos' : 'Frecuencias'}
          </button>
        </div>
      </div>

      <div className="flex gap-3 items-start justify-center flex-wrap">
        {/* ── SVG wheel ── */}
        <div className="relative">
          <svg width="320" height="320" viewBox="0 0 320 320">
            <circle cx={CX} cy={CY} r={R_OUTER + 5} fill="#0d1117" />
            {WHEEL_ORDER.map((num, idx) => {
              const freq = frequencies?.[num] ?? 0;
              const opacity = heatOverlay(freq, maxFreq, totalSpins, num);
              const { lx, ly } = labelPos(idx);
              const fill = baseColor(num, showCylinder);
              const cylSec = CYL_MAP[num];
              return (
                <g key={num} onMouseEnter={() => setHovered(num)} onMouseLeave={() => setHovered(null)}>
                  <path
                    d={segPath(idx)}
                    fill={fill}
                    fillOpacity={opacity}
                    stroke="#0d1117"
                    strokeWidth="0.8"
                    style={{
                      filter: hovered === num ? 'brightness(2)' : undefined,
                      cursor: 'pointer'
                    }}
                  />
                  {/* Cylinder sector indicator ring (outer) */}
                  {showCylinder && (
                    <path
                      d={(() => {
                        const R2 = R_OUTER + 3, R3 = R_OUTER - 1;
                        const a1 = idx * ANGLE_STEP - Math.PI / 2;
                        const a2 = (idx + 1) * ANGLE_STEP - Math.PI / 2;
                        return [
                          `M ${CX + R2 * Math.cos(a1)} ${CY + R2 * Math.sin(a1)}`,
                          `A ${R2} ${R2} 0 0 1 ${CX + R2 * Math.cos(a2)} ${CY + R2 * Math.sin(a2)}`,
                          `L ${CX + R3 * Math.cos(a2)} ${CY + R3 * Math.sin(a2)}`,
                          `A ${R3} ${R3} 0 0 0 ${CX + R3 * Math.cos(a1)} ${CY + R3 * Math.sin(a1)}`, 'Z'
                        ].join(' ');
                      })()}
                      fill={cylSec === 'S0' ? '#3b82f6' : cylSec === 'S5' ? '#f43f5e' : '#71717a'}
                      fillOpacity={0.9}
                      stroke="none"
                    />
                  )}
                  <text
                    x={lx} y={ly}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={num >= 10 ? '7.5' : '8.5'}
                    fill={hovered === num ? '#ffffff' : '#e5e7eb'}
                    fontWeight="700"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {num}
                  </text>
                </g>
              );
            })}

            {/* ── Center info ── */}
            <circle cx={CX} cy={CY} r={R_INNER - 2} fill="#0d1117" />
            {hovered !== null ? (
              <>
                <text x={CX} y={CY - 18} textAnchor="middle" fontSize="26" fontWeight="900"
                  fill={hovered === 0 ? '#22c55e' : RED_NUMBERS.has(hovered) ? '#ef4444' : '#d1d5db'}>
                  {hovered}
                </text>
                <text x={CX} y={CY + 4} textAnchor="middle" fontSize="9" fill="#9ca3af">
                  {frequencies?.[hovered] ?? 0} veces
                </text>
                <text x={CX} y={CY + 17} textAnchor="middle" fontSize="9"
                  fill={(frequencies?.[hovered] ?? 0) > expected ? '#f87171' : '#60a5fa'}>
                  {expected > 0 ? `${(((frequencies?.[hovered] ?? 0) - expected) / Math.max(expected,1)*100).toFixed(1)}%` : '—'}
                </text>
                <text x={CX} y={CY + 30} textAnchor="middle" fontSize="8" fill="#6b7280">
                  {CYL_MAP[hovered] === 'S0' ? 'Sector 0' : CYL_MAP[hovered] === 'S5' ? 'Sector 5' : 'Huérfano'}
                </text>
              </>
            ) : (
              <>
                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="10" fill="#6b7280">{totalSpins} tiradas</text>
                <text x={CX} y={CY + 8} textAnchor="middle" fontSize="8" fill="#4b5563">hover = info</text>
              </>
            )}
          </svg>
        </div>

        {/* ── Legend ── */}
        <div className="flex flex-col gap-2 text-xs">
          {!showCylinder ? (
            <>
              <div className="font-semibold text-gray-400 uppercase tracking-wide text-xs mb-1">Frecuencia</div>
              {[
                { color:'#ef4444', label:'Muy caliente' },
                { color:'#f97316', label:'Caliente' },
                { color:'#6b7280', label:'Normal' },
                { color:'#1e3a5f', label:'Frío' },
                { color:'#0f172a', label:'Muy frío' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                  <span className="text-gray-400">{label}</span>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-gray-700">
                <div className="text-gray-500">Esp./nº:</div>
                <div className="text-gray-300 font-mono">{expected > 0 ? expected.toFixed(1) : '—'}</div>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-gray-400 uppercase tracking-wide text-xs mb-1">Sectores físicos</div>
              {[
                { color:'#3b82f6', label:`Sector 0 (±7)`, count: CYLINDER_SECTORS.s0.length },
                { color:'#f43f5e', label:`Sector 5 (±7)`, count: CYLINDER_SECTORS.s5.length },
                { color:'#71717a', label:'Huérfanos',      count: CYLINDER_SECTORS.orphans.length },
              ].map(({ color, label, count }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                  <div>
                    <div className="text-gray-300">{label}</div>
                    <div className="text-gray-500">{count} números</div>
                  </div>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-gray-700 text-gray-500">
                <div className="font-semibold text-gray-400 mb-1">S0 ({CYLINDER_SECTORS.s0.length}n):</div>
                <div className="font-mono text-xs leading-relaxed">{CYLINDER_SECTORS.s0.sort((a,b)=>a-b).join(' ')}</div>
                <div className="font-semibold text-gray-400 mt-1 mb-1">S5 ({CYLINDER_SECTORS.s5.length}n):</div>
                <div className="font-mono text-xs leading-relaxed">{CYLINDER_SECTORS.s5.sort((a,b)=>a-b).join(' ')}</div>
                <div className="font-semibold text-gray-400 mt-1 mb-1">ORF ({CYLINDER_SECTORS.orphans.length}n):</div>
                <div className="font-mono text-xs leading-relaxed">{CYLINDER_SECTORS.orphans.sort((a,b)=>a-b).join(' ')}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
