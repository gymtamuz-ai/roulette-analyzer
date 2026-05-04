import { useState, useEffect, useCallback } from 'react';
import { RED_NUMBERS } from '../utils/roulette';

const ROULETTE_LAYOUT = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
];

function numColor(n) {
  if (n === 0) return 'bg-green-700 hover:bg-green-600 border-green-500';
  if (RED_NUMBERS.has(n)) return 'bg-red-700 hover:bg-red-600 border-red-500';
  return 'bg-gray-800 hover:bg-gray-700 border-gray-600';
}

export default function NumberPad({ onSpin, lastNumber, disabled }) {
  const [inputVal, setInputVal] = useState('');
  const [flash, setFlash] = useState(null);

  const handleClick = useCallback((n) => {
    if (disabled) return;
    setFlash(n);
    setTimeout(() => setFlash(null), 300);
    onSpin(n);
  }, [onSpin, disabled]);

  const handleManual = (e) => {
    e.preventDefault();
    const n = parseInt(inputVal);
    if (!isNaN(n) && n >= 0 && n <= 36) {
      handleClick(n);
      setInputVal('');
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && inputVal !== '') return;
      const n = parseInt(e.key);
      if (!isNaN(n) && e.key.length === 1) setInputVal(prev => {
        const next = prev + e.key;
        return parseInt(next) <= 36 ? next : e.key;
      });
      if (e.key === 'Backspace') setInputVal(prev => prev.slice(0, -1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inputVal]);

  return (
    <div className="card flex flex-col gap-3">
      <div className="card-title">🎰 Registrar Tirada</div>

      {/* Grid layout (3 rows × 12 columns matching roulette table) */}
      <div className="flex flex-col gap-1">
        {ROULETTE_LAYOUT.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {row.map(n => (
              <button
                key={n}
                onClick={() => handleClick(n)}
                disabled={disabled}
                className={`flex-1 h-10 rounded border text-sm font-bold transition-all duration-100 active:scale-90
                  ${numColor(n)}
                  ${flash === n ? 'scale-110 brightness-125' : ''}
                  ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {n}
              </button>
            ))}
          </div>
        ))}

        {/* Zero */}
        <button
          onClick={() => handleClick(0)}
          disabled={disabled}
          className={`w-full h-10 rounded border text-sm font-bold bg-green-700 hover:bg-green-600 border-green-500 transition-all
            ${flash === 0 ? 'scale-105 brightness-125' : ''}
            ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          0 — CERO
        </button>
      </div>

      {/* Manual input */}
      <form onSubmit={handleManual} className="flex gap-2">
        <input
          type="number"
          min="0"
          max="36"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="0–36"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button type="submit" disabled={disabled} className="btn-primary disabled:opacity-40">
          ↵ OK
        </button>
      </form>

      {/* Last number display */}
      {lastNumber !== null && lastNumber !== undefined && (
        <div className={`text-center py-3 rounded-xl border-2 font-black text-4xl pulse-once
          ${lastNumber === 0 ? 'border-green-500 bg-green-900/30 text-green-300' :
            RED_NUMBERS.has(lastNumber) ? 'border-red-500 bg-red-900/30 text-red-300 glow-red' :
            'border-gray-500 bg-gray-800/50 text-white'}`}>
          {lastNumber}
        </div>
      )}
    </div>
  );
}
