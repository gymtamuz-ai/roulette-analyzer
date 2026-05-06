import { RED_NUMBERS } from '../utils/roulette';

// ─── Generic delay bar row ────────────────────────────────────────────────────
function DelayRow({ label, delay, maxDelay, expected, color = 'bg-blue-500', badge }) {
  const ratio      = expected > 0 ? delay / (expected * 3) : 0;
  const pct        = Math.min(ratio * 100, 100);
  const maxPct     = expected > 0 ? Math.min((maxDelay / (expected * 3)) * 100, 100) : 0;
  const isCold     = delay > expected * 1.8;
  const isOverdue  = delay > expected * 2.5;
  const barColor   = isOverdue ? 'bg-red-500' : isCold ? 'bg-orange-500' : color;

  return (
    <div className="flex items-center gap-2">
      {badge
        ? <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-xs font-bold shrink-0 ${badge}`}>{label}</span>
        : <span className="text-gray-400 text-xs w-14 shrink-0 truncate">{label}</span>
      }

      {/* Bar with max-delay ghost marker */}
      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden relative">
        <div className={`h-2 rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
        {/* Ghost line for historical max */}
        {maxDelay > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-400 opacity-50"
            style={{ left: `${maxPct}%` }}
          />
        )}
      </div>

      {/* Current delay */}
      <span className={`text-xs font-mono w-5 text-right shrink-0 ${isOverdue ? 'text-red-400 font-bold' : isCold ? 'text-orange-400' : 'text-gray-400'}`}>
        {delay}
      </span>

      {/* Max delay */}
      {maxDelay !== undefined && (
        <span className="text-xs font-mono w-5 text-gray-600 shrink-0 text-right" title="Atraso máximo histórico">
          {maxDelay}
        </span>
      )}

      {isOverdue && <span className="text-red-400 text-xs shrink-0">‼</span>}
    </div>
  );
}

// ─── Sub-section ──────────────────────────────────────────────────────────────
function Section({ title, children, cols = 1, legend }) {
  return (
    <div className="bg-gray-800/60 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{title}</div>
        {legend && (
          <div className="text-xs text-gray-600 flex gap-2">
            <span>act</span><span className="text-gray-700">|</span><span>máx</span>
          </div>
        )}
      </div>
      <div className={`${cols === 2 ? 'grid grid-cols-2 gap-x-4 gap-y-1.5' : 'space-y-1.5'}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Number chip ──────────────────────────────────────────────────────────────
function NumChip({ n }) {
  const cls = n === 0 ? 'bg-green-800 text-green-200'
    : RED_NUMBERS.has(n) ? 'bg-red-900 text-red-200'
    : 'bg-gray-700 text-gray-200';
  return <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${cls}`}>{n}</span>;
}

export default function DelayPanel({ allDelays, maxDelays, totalSpins }) {
  if (!allDelays || totalSpins === 0) {
    return (
      <div className="card">
        <div className="card-title">⏱ Atrasos</div>
        <p className="text-gray-500 text-sm text-center py-4">Sin tiradas aún</p>
      </div>
    );
  }

  const { numbers, color, parity, half, dozen, col, sectorA4, cylinder } = allDelays;
  const mx = maxDelays || {};

  const expectedNum    = 37;
  const expectedColor  = 2;
  const expectedParity = 2;
  const expectedHalf   = 2;
  const expectedDozen  = 3;
  const expectedCol    = 3;
  const expectedSectA  = 4;
  const expectedCyl0   = Math.round(37 / 15);
  const expectedCylOrf = Math.round(37 / 7);

  // Top overdue numbers
  const topNums = Object.entries(numbers || {})
    .map(([n, d]) => ({ n: parseInt(n), d, max: mx.numbers?.[parseInt(n)] ?? 0 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 12);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="card-title mb-0">⏱ Atrasos</div>
        <div className="text-xs text-gray-600 flex gap-2 mr-1">
          <span className="text-gray-500">act</span>
          <span className="text-gray-700">|</span>
          <span className="text-gray-600">máx</span>
        </div>
      </div>

      {/* ── Chances simples ── */}
      <Section title="Chances Simples" legend>
        <DelayRow label="Rojo"  delay={color?.red   ?? 0} maxDelay={mx.color?.red   ?? 0} expected={expectedColor}  color="bg-red-600"   />
        <DelayRow label="Negro" delay={color?.black  ?? 0} maxDelay={mx.color?.black  ?? 0} expected={expectedColor}  color="bg-gray-500"  />
        <DelayRow label="Verde" delay={color?.green  ?? 0} maxDelay={mx.color?.green  ?? 0} expected={37}             color="bg-green-600" />
        <DelayRow label="Par"   delay={parity?.even  ?? 0} maxDelay={mx.parity?.even  ?? 0} expected={expectedParity} color="bg-blue-500"  />
        <DelayRow label="Impar" delay={parity?.odd   ?? 0} maxDelay={mx.parity?.odd   ?? 0} expected={expectedParity} color="bg-purple-500"/>
        <DelayRow label="1–18"  delay={half?.low     ?? 0} maxDelay={mx.half?.low     ?? 0} expected={expectedHalf}   color="bg-cyan-600"  />
        <DelayRow label="19–36" delay={half?.high    ?? 0} maxDelay={mx.half?.high    ?? 0} expected={expectedHalf}   color="bg-teal-600"  />
      </Section>

      {/* ── Docenas y columnas ── */}
      <Section title="Docenas / Columnas" cols={2} legend>
        <DelayRow label="D1 1–12"  delay={dozen?.[1] ?? 0} maxDelay={mx.dozen?.[1] ?? 0} expected={expectedDozen} color="bg-amber-600" />
        <DelayRow label="C1"       delay={col?.[1]   ?? 0} maxDelay={mx.col?.[1]   ?? 0} expected={expectedCol}   color="bg-pink-600"  />
        <DelayRow label="D2 13–24" delay={dozen?.[2] ?? 0} maxDelay={mx.dozen?.[2] ?? 0} expected={expectedDozen} color="bg-amber-600" />
        <DelayRow label="C2"       delay={col?.[2]   ?? 0} maxDelay={mx.col?.[2]   ?? 0} expected={expectedCol}   color="bg-pink-600"  />
        <DelayRow label="D3 25–36" delay={dozen?.[3] ?? 0} maxDelay={mx.dozen?.[3] ?? 0} expected={expectedDozen} color="bg-amber-600" />
        <DelayRow label="C3"       delay={col?.[3]   ?? 0} maxDelay={mx.col?.[3]   ?? 0} expected={expectedCol}   color="bg-pink-600"  />
      </Section>

      {/* ── Sectores A4 ── */}
      <Section title="Sectores A4" legend>
        {[1,2,3,4].map(s => (
          <DelayRow key={s} label={`S${s}`} delay={sectorA4?.[s] ?? 0} maxDelay={mx.sectorA4?.[s] ?? 0} expected={expectedSectA} color="bg-violet-600" />
        ))}
      </Section>

      {/* ── Sectores del cilindro ── */}
      <Section title="Sectores Cilindro" legend>
        <DelayRow label="Sector 0 (±7)"  delay={cylinder?.S0  ?? 0} maxDelay={mx.cylinder?.S0  ?? 0} expected={expectedCyl0}  color="bg-sky-600"  />
        <DelayRow label="Sector 5 (±7)"  delay={cylinder?.S5  ?? 0} maxDelay={mx.cylinder?.S5  ?? 0} expected={expectedCyl0}  color="bg-rose-600" />
        <DelayRow label="Huérfanos"      delay={cylinder?.ORF ?? 0} maxDelay={mx.cylinder?.ORF ?? 0} expected={expectedCylOrf} color="bg-zinc-500" />
      </Section>

      {/* ── Top números atrasados ── */}
      <Section title="Top 12 números más atrasados" legend>
        <div className="space-y-1.5">
          {topNums.map(({ n, d, max }) => (
            <div key={n} className="flex items-center gap-2">
              <NumChip n={n} />
              <div className="flex-1 bg-gray-800 rounded-full h-2 relative overflow-hidden">
                <div
                  className={`h-2 rounded-full ${d > expectedNum * 2 ? 'bg-red-500' : d > expectedNum ? 'bg-orange-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((d / (expectedNum * 3)) * 100, 100)}%` }}
                />
                {max > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-gray-400 opacity-40"
                    style={{ left: `${Math.min((max / (expectedNum * 3)) * 100, 100)}%` }}
                  />
                )}
              </div>
              <span className={`text-xs font-mono w-5 text-right ${d > expectedNum * 2 ? 'text-red-400 font-bold' : d > expectedNum ? 'text-orange-400' : 'text-gray-400'}`}>{d}</span>
              <span className="text-xs font-mono w-5 text-gray-600 text-right">{max}</span>
              {d > expectedNum && <span className="text-xs text-orange-400">!</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
