import { RED_NUMBERS } from '../utils/roulette';

function NumBadge({ n, small }) {
  const base = n === 0 ? 'bg-green-700 text-green-100' : RED_NUMBERS.has(n) ? 'bg-red-700 text-red-100' : 'bg-gray-700 text-gray-100';
  return (
    <span className={`${small ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'} inline-flex items-center justify-center rounded-full font-bold ${base}`}>
      {n}
    </span>
  );
}

export default function SpinHistory({ spins, onUndo }) {
  const recent = [...spins].reverse().slice(0, 50);

  return (
    <div className="card flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between">
        <span className="card-title mb-0">📜 Historial ({spins.length})</span>
        {spins.length > 0 && (
          <button onClick={onUndo} className="btn-danger text-xs py-1 px-2">
            ↩ Deshacer
          </button>
        )}
      </div>

      {spins.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">Sin tiradas aún</p>
      ) : (
        <>
          {/* Last 20 as badges */}
          <div className="flex flex-wrap gap-1.5">
            {recent.slice(0, 20).map((s, i) => (
              <NumBadge key={s.id || i} n={s.number} small />
            ))}
          </div>

          {/* Compact text list for older */}
          {recent.length > 20 && (
            <div className="text-gray-500 text-xs flex flex-wrap gap-1 pt-1 border-t border-gray-800">
              {recent.slice(20).map((s, i) => (
                <span key={i} className={
                  s.number === 0 ? 'text-green-500' :
                  RED_NUMBERS.has(s.number) ? 'text-red-400' : 'text-gray-300'
                }>{s.number}</span>
              ))}
            </div>
          )}

          {/* Mini stats bar */}
          <div className="grid grid-cols-3 gap-1 pt-1 border-t border-gray-800 text-xs text-gray-400">
            <div className="text-center">
              <span className="text-red-400 font-semibold">{spins.filter(s => s.color === 'red').length}</span> R
            </div>
            <div className="text-center">
              <span className="text-gray-300 font-semibold">{spins.filter(s => s.color === 'black').length}</span> N
            </div>
            <div className="text-center">
              <span className="text-green-400 font-semibold">{spins.filter(s => s.color === 'green').length}</span> V
            </div>
          </div>
        </>
      )}
    </div>
  );
}
