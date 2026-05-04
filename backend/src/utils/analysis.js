const { WHEEL_ORDER } = require('./roulette');

function calculateFrequencies(spins) {
  const freq = {};
  for (let i = 0; i <= 36; i++) freq[i] = 0;
  for (const s of spins) freq[s.number] = (freq[s.number] || 0) + 1;
  return freq;
}

function calculateDelays(spins) {
  const lastSeen = {};
  for (let i = 0; i <= 36; i++) lastSeen[i] = null;
  spins.forEach((s, idx) => { lastSeen[s.number] = idx; });
  const delays = {};
  for (let n = 0; n <= 36; n++) {
    delays[n] = lastSeen[n] === null ? spins.length : spins.length - 1 - lastSeen[n];
  }
  return delays;
}

function calculateSectorDelays(spins, sectorType) {
  const key = sectorType === 'A3' ? 'sector_a3' : 'sector_a4';
  const lastSeen = { 1: null, 2: null, 3: null, 4: null };
  spins.forEach((s, idx) => { if (s[key]) lastSeen[s[key]] = idx; });
  const delays = {};
  for (const s of [1, 2, 3, 4]) {
    delays[s] = lastSeen[s] === null ? spins.length : spins.length - 1 - lastSeen[s];
  }
  return delays;
}

function calculateTrends(spins, windows = [10, 25, 50]) {
  const countBy = (arr, key) => arr.reduce((acc, item) => {
    const v = item[key];
    if (v !== null && v !== undefined) acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});

  return windows.reduce((acc, w) => {
    const recent = spins.slice(-w);
    acc[w] = {
      total: recent.length,
      color: countBy(recent, 'color'),
      parity: countBy(recent, 'parity'),
      dozen: countBy(recent, 'dozen'),
      sectorA3: countBy(recent, 'sector_a3'),
      sectorA4: countBy(recent, 'sector_a4')
    };
    return acc;
  }, {});
}

function getDataQuality(n) {
  if (n < 300) return { label: 'MUESTRA INSUFICIENTE', emoji: '❌', level: 0, color: 'red' };
  if (n < 1000) return { label: 'DATOS EN FORMACIÓN', emoji: '⚠️', level: 1, color: 'yellow' };
  if (n < 5000) return { label: 'MUESTRA RELEVANTE', emoji: '✅', level: 2, color: 'green' };
  return { label: 'SESGO DETECTABLE', emoji: '🔥', level: 3, color: 'orange' };
}

function calculateBiasMetrics(spins) {
  const n = spins.length;
  if (n === 0) return { n: 0, quality: getDataQuality(0) };

  const freq = calculateFrequencies(spins);
  const expected = n / 37;

  const deviations = {};
  let chiSquare = 0;
  for (let num = 0; num <= 36; num++) {
    deviations[num] = parseFloat(((freq[num] - expected) / expected * 100).toFixed(2));
    chiSquare += Math.pow(freq[num] - expected, 2) / expected;
  }

  const sorted = Object.entries(freq).sort(([, a], [, b]) => b - a);
  const hotNumbers = sorted.slice(0, 7).map(([num, f]) => ({
    number: parseInt(num), frequency: f, deviation: deviations[num]
  }));
  const coldNumbers = sorted.slice(-7).reverse().map(([num, f]) => ({
    number: parseInt(num), frequency: f, deviation: deviations[num]
  }));

  // Detect cylinder bias zones (5-pocket sliding window)
  const wheelFreqs = WHEEL_ORDER.map(n => freq[n] || 0);
  const avg = n / 37;
  const hotZones = [];
  const W = 5;
  for (let i = 0; i < WHEEL_ORDER.length; i++) {
    let sum = 0;
    for (let j = 0; j < W; j++) sum += wheelFreqs[(i + j) % WHEEL_ORDER.length];
    const ratio = sum / (avg * W);
    if (ratio > 1.35) {
      hotZones.push({
        startNumber: WHEEL_ORDER[i],
        numbers: Array.from({ length: W }, (_, k) => WHEEL_ORDER[(i + k) % WHEEL_ORDER.length]),
        ratio: parseFloat(ratio.toFixed(3))
      });
    }
  }

  return { n, expected: parseFloat(expected.toFixed(2)), freq, deviations, chiSquare: parseFloat(chiSquare.toFixed(2)), hotNumbers, coldNumbers, hotZones, quality: getDataQuality(n) };
}

module.exports = { calculateFrequencies, calculateDelays, calculateSectorDelays, calculateTrends, calculateBiasMetrics, getDataQuality };
