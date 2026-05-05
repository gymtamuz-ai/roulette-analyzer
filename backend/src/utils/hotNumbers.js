/**
 * computeHotNumbers — frecuencia de una ventana de números de ruleta.
 *
 * @param {number[]} numbers — array de números (0-36)
 * @returns {{ num: number, count: number }[]} ordenado desc por frecuencia
 */
function computeHotNumbers(numbers) {
  const freq = {};
  numbers.forEach(n => {
    freq[n] = (freq[n] || 0) + 1;
  });
  return Object.entries(freq)
    .map(([num, count]) => ({ num: Number(num), count }))
    .sort((a, b) => b.count - a.count || a.num - b.num);
}

module.exports = { computeHotNumbers };
