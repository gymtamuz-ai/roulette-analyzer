// ═══════════════════════════════════════════════════════════════════════════════
// VECINOS Analytics — Backend (CommonJS)
// ═══════════════════════════════════════════════════════════════════════════════

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30,
  8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];
const N = 37;

const WHEEL_INDEX = {};
for (let i = 0; i < N; i++) WHEEL_INDEX[WHEEL_ORDER[i]] = i;

const ZONE_COVERAGE = 9 / N;

function computeZonePersistence(spins, zoneNumbers, { windowSize = 20, step = 10, maxWindows = 6, threshold = 1.30 } = {}) {
  if (spins.length < windowSize) return { score: 0, hotWindows: 0, totalWindows: 0 };
  const zoneSet  = new Set(zoneNumbers);
  const expected = windowSize * ZONE_COVERAGE;
  let hotWindows = 0, totalWindows = 0;
  for (let end = spins.length; end >= windowSize && totalWindows < maxWindows; end -= step) {
    const slice = spins.slice(end - windowSize, end);
    const hits  = slice.filter(s => zoneSet.has(s.number)).length;
    if (hits >= expected * threshold) hotWindows++;
    totalWindows++;
  }
  return { score: totalWindows > 0 ? hotWindows / totalWindows : 0, hotWindows, totalWindows };
}

function computeZoneStability(spins, primaryCenterNum, { windowSize = 20, step = 10, maxWindows = 6, maxDrift = 4 } = {}) {
  if (spins.length < windowSize * 2) return { score: 0, stableWindows: 0, totalWindows: 0 };
  const primaryPos = WHEEL_INDEX[primaryCenterNum];
  if (primaryPos === undefined) return { score: 0, stableWindows: 0, totalWindows: 0 };
  let stableWindows = 0, totalWindows = 0;
  for (let end = spins.length; end >= windowSize && totalWindows < maxWindows; end -= step) {
    const slice  = spins.slice(end - windowSize, end);
    const { bestCenter } = _findBestCenterRaw(slice);
    if (bestCenter !== -1) {
      const dist = Math.min(Math.abs(bestCenter - primaryPos), N - Math.abs(bestCenter - primaryPos));
      if (dist <= maxDrift) stableWindows++;
    }
    totalWindows++;
  }
  return { score: totalWindows > 0 ? stableWindows / totalWindows : 0, stableWindows, totalWindows };
}

function computeZoneQuality(spins, zone) {
  if (!zone || spins.length < 20) return { quality: 0, persistence: 0, stability: 0, antiSpike: false };
  const { numbers, center, zScore } = zone;
  const antiSpike = zScore > 3.5;
  const { score: persistence } = computeZonePersistence(spins, numbers);
  const { score: stability }   = computeZoneStability(spins, center);

  let baseScore = 0;
  if (zScore >= 2.5)       baseScore = 50;
  else if (zScore >= 2.0)  baseScore = 42;
  else if (zScore >= 1.65) baseScore = 33;
  else if (zScore >= 1.30) baseScore = 20;

  const quality = Math.max(0, Math.min(100,
    baseScore + Math.round(persistence * 30) + Math.round(stability * 15) + (antiSpike ? -15 : 0),
  ));
  return { quality, persistence: parseFloat(persistence.toFixed(3)), stability: parseFloat(stability.toFixed(3)), antiSpike };
}

function _findBestCenterRaw(spins) {
  const freq = new Array(N).fill(0);
  for (const s of spins) { const pos = WHEEL_INDEX[s.number]; if (pos !== undefined) freq[pos]++; }
  let bestCenter = -1, bestHits = 0;
  for (let center = 0; center < N; center++) {
    let hits = 0;
    for (let d = -4; d <= 4; d++) hits += freq[(center + d + N) % N];
    if (hits > bestHits) { bestHits = hits; bestCenter = center; }
  }
  return { bestCenter, bestHits };
}

module.exports = { computeZonePersistence, computeZoneStability, computeZoneQuality };
