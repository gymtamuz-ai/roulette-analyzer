const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// Physical European roulette wheel order
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

// A3: 4 sectors each covering 3 non-consecutive streets (9 numbers spread across the table)
const A3_SECTORS = {
  1: [1, 2, 3, 13, 14, 15, 25, 26, 27],
  2: [4, 5, 6, 16, 17, 18, 28, 29, 30],
  3: [7, 8, 9, 19, 20, 21, 31, 32, 33],
  4: [10, 11, 12, 22, 23, 24, 34, 35, 36]
};

// Build reverse lookup
const A3_REVERSE = {};
for (const [sector, nums] of Object.entries(A3_SECTORS)) {
  for (const n of nums) A3_REVERSE[n] = parseInt(sector);
}

// A4: 4 sectors of 9 consecutive numbers
const A4_SECTORS = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  2: [10, 11, 12, 13, 14, 15, 16, 17, 18],
  3: [19, 20, 21, 22, 23, 24, 25, 26, 27],
  4: [28, 29, 30, 31, 32, 33, 34, 35, 36]
};

function classifyNumber(n) {
  if (n === 0) {
    return { number: 0, color: 'green', parity: 'zero', dozen: null, col: null,
             sector_a3: null, sector_a4: null, half: null };
  }
  return {
    number: n,
    color: RED_NUMBERS.has(n) ? 'red' : 'black',
    parity: n % 2 === 0 ? 'even' : 'odd',
    dozen: n <= 12 ? 1 : n <= 24 ? 2 : 3,
    col: ((n - 1) % 3) + 1,
    sector_a3: A3_REVERSE[n] || null,
    sector_a4: n <= 9 ? 1 : n <= 18 ? 2 : n <= 27 ? 3 : 4,
    half: n <= 18 ? 'low' : 'high'
  };
}

function getSectorNumbers(systemType, sectorNum) {
  if (systemType === 'A3') return A3_SECTORS[sectorNum] || [];
  return A4_SECTORS[sectorNum] || [];
}

// Returns 3 streets of 3 numbers each for a sector
function getSectorStreets(systemType, sectorNum) {
  const nums = getSectorNumbers(systemType, sectorNum);
  return [nums.slice(0, 3), nums.slice(3, 6), nums.slice(6, 9)];
}

module.exports = { RED_NUMBERS, WHEEL_ORDER, A3_SECTORS, A4_SECTORS, A3_REVERSE, classifyNumber, getSectorNumbers, getSectorStreets };
