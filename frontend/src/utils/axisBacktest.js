// ═══════════════════════════════════════════════════════════════════════════════
// AXIS BACKTEST ENGINE — Phase 4 (extended)
// Replay histórico determinístico.
// Phase 4 adds: Sharpe-like stability, streak distribution, trigger analysis.
// Phase 4b adds: series-level lifecycle (recoveredSeries / failedSeries).
// NOTA: O(n²) — limitado a MAX_BACKTEST_SPINS para no bloquear UI.
//
// ─── LIFECYCLE SEMANTICS ────────────────────────────────────────────────────
//
//   recoveredSeries = progressions that ended with a WIN at any step (1–20)
//   failedSeries    = progressions where EVERY step up to 20 was lost
//
//   These are the CORRECT "Ganados" / "Abortados" counters.
//   A series is NOT aborted by: cycle expiry, sector change, drawdown, or PnL.
//   It is ONLY aborted when it loses step 20.
//
// ═══════════════════════════════════════════════════════════════════════════════

import { computeAxisState } from './axis';
import { getProgressionEntry, MAX_PROGRESSION_STEP } from '../strategies/axis6stars/moneyManagement/axisProgression';

const MAX_BACKTEST_SPINS = 300;

function emptySectorStat() { return { wins: 0, losses: 0, profit: 0, cycles: 0 }; }

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / arr.length);
}

// ─── Streak distribution ──────────────────────────────────────────────────────
function computeStreakDistribution(betResults) {
  const winStreaks  = [];
  const lossStreaks = [];
  let curW = 0, curL = 0;

  for (const r of betResults) {
    if (r.isWin) { if (curL > 0) lossStreaks.push(curL); curL = 0; curW++; }
    else         { if (curW > 0) winStreaks.push(curW);  curW = 0; curL++; }
  }
  if (curW > 0) winStreaks.push(curW);
  if (curL > 0) lossStreaks.push(curL);

  return {
    maxWinStreak:  winStreaks.length  > 0 ? Math.max(...winStreaks)  : 0,
    maxLossStreak: lossStreaks.length > 0 ? Math.max(...lossStreaks) : 0,
    avgWinStreak:  winStreaks.length  > 0 ? parseFloat((winStreaks.reduce((s, x) => s + x, 0)  / winStreaks.length).toFixed(1))  : 0,
    avgLossStreak: lossStreaks.length > 0 ? parseFloat((lossStreaks.reduce((s, x) => s + x, 0) / lossStreaks.length).toFixed(1)) : 0,
    winStreaks,
    lossStreaks,
  };
}

// ─── Trigger type analysis ────────────────────────────────────────────────────
function analyzeTriggerTypes(betResults) {
  const byType = {};
  for (const r of betResults) {
    const type = r.sector.startsWith('E') ? 'ECLIPSE'
               : r.sector.startsWith('H') ? 'H'
               : 'V';
    if (!byType[type]) byType[type] = { wins: 0, losses: 0, profit: 0 };
    byType[type][r.isWin ? 'wins' : 'losses']++;
    byType[type].profit += r.profit;
  }
  return Object.entries(byType).map(([type, s]) => ({
    type,
    total:   s.wins + s.losses,
    wins:    s.wins,
    winrate: Math.round(s.wins / (s.wins + s.losses) * 100),
    profit:  s.profit,
  })).sort((a, b) => b.profit - a.profit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// runAxisBacktest(spins, options) → BacktestResult | null
// ═══════════════════════════════════════════════════════════════════════════════
export function runAxisBacktest(spins, { maxSpins = MAX_BACKTEST_SPINS } = {}) {
  if (!spins || spins.length < 10) return null;

  const window      = spins.slice(-maxSpins);
  const betResults  = [];
  let   balance     = 0;
  let   peak        = 0;
  let   maxDrawdown = 0;
  const sectorStats = {};

  // ── Session-level progression (persists across sector/trigger switches) ──────
  let progressionStep = 1;

  // ── Series lifecycle (correct Ganados / Abortados) ───────────────────────────
  // RECOVERED: any win at any step         → increment recoveredSeries, reset step
  // FAILED:    loss at the final step (20) → increment failedSeries, reset step
  let recoveredSeries = 0;
  let failedSeries    = 0;
  const recoverSteps  = []; // step at which each recovery occurred

  for (let i = 1; i < window.length; i++) {
    const history = window.slice(0, i);
    const state   = computeAxisState(history);
    if (!state.isActive) continue;

    const raw = window[i];
    const num = typeof raw === 'object' ? (raw.number ?? 0) : +raw;
    if (num === 0) continue;

    const isWin          = state.betNumbers.includes(num);
    const betCount       = state.betNumbers.length;
    const progEntry      = getProgressionEntry(progressionStep);
    const stakePerNumber = progEntry.chips;
    const chips          = stakePerNumber * betCount;
    const profit         = isWin
      ? stakePerNumber * (36 - betCount)
      : -chips;

    // ── Lifecycle advance ────────────────────────────────────────────────────
    if (isWin) {
      // WIN at any step → series RECOVERED
      recoveredSeries++;
      recoverSteps.push(progressionStep);
      progressionStep = 1;
    } else if (progressionStep >= MAX_PROGRESSION_STEP) {
      // LOSS at step 20 → series FAILED (the ONLY valid abort condition)
      failedSeries++;
      progressionStep = 1;
    } else {
      progressionStep++;
    }

    balance += profit;
    if (balance > peak) peak = balance;
    const dd = peak - balance;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const sKey = state.status === 'TRIGGERED_ECLIPSE' ? `E${state.aceNumber}`
               : state.status === 'TRIGGERED_H'       ? `H${state.triggeredH}`
               : `V${state.triggeredV}`;

    if (!sectorStats[sKey]) sectorStats[sKey] = emptySectorStat();
    const ss = sectorStats[sKey];
    ss.cycles++;
    ss.profit += profit;
    if (isWin) ss.wins++; else ss.losses++;

    betResults.push({
      spinIndex: i, num, isWin,
      chips, stakePerNumber, betCount,
      profit, balance, sector: sKey,
      progressionStep: progEntry.step,
    });
  }

  const total = betResults.length;
  if (total === 0) {
    return {
      total: 0, wins: 0, losses: 0, winrate: 0,
      totalProfit: 0, maxDrawdown: 0, spinsAnalyzed: window.length,
      recoveredSeries: 0, failedSeries: 0,
    };
  }

  const wins   = betResults.filter(r => r.isWin).length;
  const losses = total - wins;
  const profits = betResults.map(r => r.profit);

  const grossWin  = profits.filter(p => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(profits.filter(p => p < 0).reduce((s, p) => s + p, 0));
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? '∞' : '0';

  const totalWagered = betResults.reduce((s, r) => s + r.chips, 0);

  // Sharpe-like stability: mean(profit per bet) / std(profit per bet)
  const meanP  = balance / total;
  const sdP    = stdDev(profits);
  const sharpe = sdP > 0 ? parseFloat((meanP / sdP).toFixed(3)) : (meanP > 0 ? 99 : -99);

  const sectorList = Object.entries(sectorStats)
    .map(([key, s]) => ({ key, ...s, winrate: Math.round(s.wins / s.cycles * 100) }))
    .sort((a, b) => b.profit - a.profit);

  const streaks      = computeStreakDistribution(betResults);
  const triggerTypes = analyzeTriggerTypes(betResults);

  // Rolling equity curve (every 5 bets)
  const equityCurve = [];
  for (let i = 4; i < betResults.length; i += 5) {
    equityCurve.push({ idx: i + 1, balance: betResults[i].balance });
  }
  equityCurve.push({ idx: betResults.length, balance });

  // ── Progression step distribution ────────────────────────────────────────────
  const stepDist = {};
  for (const r of betResults) {
    const s = r.progressionStep;
    if (!stepDist[s]) stepDist[s] = { step: s, bets: 0, wins: 0, profit: 0 };
    stepDist[s].bets++;
    stepDist[s].profit += r.profit;
    if (r.isWin) stepDist[s].wins++;
  }
  const progressionStepStats = Object.values(stepDist)
    .map(s => ({ ...s, winrate: Math.round(s.wins / s.bets * 100) }))
    .sort((a, b) => a.step - b.step);

  const maxStepReached = betResults.length > 0
    ? Math.max(...betResults.map(r => r.progressionStep))
    : 1;

  const peakExposure = betResults.reduce(
    (max, r) => Math.max(max, getProgressionEntry(r.progressionStep).exposure), 0
  );

  // ── Series lifecycle aggregate ────────────────────────────────────────────────
  const totalSeriesCompleted  = recoveredSeries + failedSeries;
  const recoveryRate          = totalSeriesCompleted > 0
    ? Math.round(recoveredSeries / totalSeriesCompleted * 100)
    : null;
  const averageRecoveryStep   = recoverSteps.length > 0
    ? parseFloat((recoverSteps.reduce((a, b) => a + b, 0) / recoverSteps.length).toFixed(1))
    : null;
  const maxStepBeforeRecovery = recoverSteps.length > 0
    ? Math.max(...recoverSteps)
    : null;

  return {
    // ── Spin-level stats ──────────────────────────────────────────────────────
    total, wins, losses,
    winrate:       Math.round(wins / total * 100),
    totalProfit:   balance,
    maxDrawdown,
    profitFactor,
    sharpe,
    roi:           totalWagered > 0 ? Math.round(balance / totalWagered * 100) : 0,
    spinsAnalyzed: window.length,
    bestSector:    sectorList[0]  ?? null,
    worstSector:   sectorList[sectorList.length - 1] ?? null,
    sectorList,
    streaks,
    triggerTypes,
    equityCurve,
    // ── Progression step stats ────────────────────────────────────────────────
    progressionStepStats,
    maxStepReached,
    peakExposure,
    // ── Series lifecycle (correct Ganados / Abortados) ────────────────────────
    recoveredSeries,       // ← correct "Ganados"
    failedSeries,          // ← correct "Abortados" (only step-20 losses)
    totalSeriesCompleted,
    recoveryRate,          // % of completed series that recovered
    averageRecoveryStep,   // avg step at which recovery happened
    maxStepBeforeRecovery, // worst recovery depth seen
  };
}
