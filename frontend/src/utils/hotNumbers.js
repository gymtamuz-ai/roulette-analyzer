/**
 * getHotNumbers — analiza la frecuencia de los últimos `windowSize` spins.
 *
 * Acepta tanto arrays de spin-objects { number, ... } como arrays de números puros.
 * Siempre devuelve el top ordenado desc por frecuencia.
 *
 * @param {Array}  spins      — array de spin-objects o números
 * @param {number} windowSize — ventana móvil (default 36)
 * @returns {{ num: number, count: number }[]}
 */
export function getHotNumbers(spins, windowSize = 36) {
  const last = spins.slice(-windowSize);

  const freq = {};
  last.forEach(item => {
    const n = (item !== null && typeof item === 'object') ? item.number : item;
    freq[n] = (freq[n] || 0) + 1;
  });

  return Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num);
}
