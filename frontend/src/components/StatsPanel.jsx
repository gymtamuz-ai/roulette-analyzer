import { calculateTrends } from '../utils/roulette';

function Bar({ label, value, max, color = 'bg-blue-500', suffix = '' }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-300 w-8 text-right font-mono">{value}{suffix}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export default function StatsPanel({ spins }) {
  if (!spins || spins.length === 0) {
    return (
      <div className="card">
        <div className="card-title">📊 Estadísticas</div>
        <p className="text-gray-500 text-sm text-center py-4">Sin tiradas</p>
      </div>
    );
  }

  const trends = calculateTrends(spins);
  const [w10, w25, w50] = [trends[10], trends[25], trends[50]];
  const total = spins.length;

  const count = (key, val) => spins.filter(s => s[key] === val).length;

  return (
    <div className="card flex flex-col gap-4">
      <div className="card-title">📊 Estadísticas en Vivo</div>

      {/* Window selector tabs (just show all 3 windows) */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { w: 10, data: w10, label: 'Últimas 10' },
          { w: 25, data: w25, label: 'Últimas 25' },
          { w: 50, data: w50, label: 'Últimas 50' }
        ].map(({ w, data, label }) => (
          <div key={w} className="bg-gray-800 rounded-lg p-2">
            <div className="text-xs text-gray-400 font-semibold mb-2 text-center">{label}</div>
            <div className="text-center text-xs space-y-1">
              <div>
                <span className="text-red-400 font-bold">{data.color?.red || 0}</span>
                <span className="text-gray-500"> R / </span>
                <span className="text-gray-300 font-bold">{data.color?.black || 0}</span>
                <span className="text-gray-500"> N / </span>
                <span className="text-green-400 font-bold">{data.color?.green || 0}</span>
                <span className="text-gray-500"> V</span>
              </div>
              <div>
                <span className="text-blue-400">{data.parity?.even || 0} P</span>
                <span className="text-gray-500"> / </span>
                <span className="text-purple-400">{data.parity?.odd || 0} I</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Global stats */}
      <Section title="Colores (total)">
        <Bar label="Rojo" value={count('color', 'red')} max={total} color="bg-red-600" />
        <Bar label="Negro" value={count('color', 'black')} max={total} color="bg-gray-500" />
        <Bar label="Verde" value={count('color', 'green')} max={total} color="bg-green-600" />
      </Section>

      <Section title="Par / Impar">
        <Bar label="Par" value={count('parity', 'even')} max={total} color="bg-blue-500" />
        <Bar label="Impar" value={count('parity', 'odd')} max={total} color="bg-purple-500" />
      </Section>

      <Section title="Docenas">
        <Bar label="1ª (1–12)" value={count('dozen', 1)} max={total} color="bg-cyan-600" />
        <Bar label="2ª (13–24)" value={count('dozen', 2)} max={total} color="bg-teal-600" />
        <Bar label="3ª (25–36)" value={count('dozen', 3)} max={total} color="bg-indigo-600" />
      </Section>

      <Section title="Sectores A3">
        {[1, 2, 3, 4].map(s => (
          <Bar key={s} label={`S${s}`} value={count('sector_a3', s)} max={total} color="bg-orange-600" />
        ))}
      </Section>

      <Section title="Sectores A4">
        {[1, 2, 3, 4].map(s => (
          <Bar key={s} label={`S${s}`} value={count('sector_a4', s)} max={total} color="bg-violet-600" />
        ))}
      </Section>
    </div>
  );
}
