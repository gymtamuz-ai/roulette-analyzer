import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from './utils/api';
import {
  classifyNumber, calculateFrequencies, calculateAllDelays,
  calculateMaxDelays, computeBettingState, randomSpin
} from './utils/roulette';
import { computeJacoboState } from './utils/jacobo';
import { computeMirrorState } from './utils/mirror';
import { computeVecinosState } from './utils/vecinos';
import { computeBestSystem }  from './utils/autoSystem';
import { getHotNumbers }       from './utils/hotNumbers';

import NumberPad from './components/NumberPad';
import SpinHistory from './components/SpinHistory';
import BettingPanel from './components/BettingPanel';
import StatsPanel from './components/StatsPanel';
import CylinderHeatmap from './components/CylinderHeatmap';
import DelayPanel from './components/DelayPanel';
import BiasPanel from './components/BiasPanel';
import SessionManager from './components/SessionManager';
import PerformancePanel from './components/PerformancePanel';
import HotNumbersPanel from './components/HotNumbersPanel';
import TableMemoryPanel from './components/TableMemoryPanel';
import ImportModal from './components/ImportModal';
import CylinderHeatmapVecinos from './components/CylinderHeatmapVecinos';
import VecinosBacktestPanel   from './components/VecinosBacktestPanel';

// ─── localStorage keys ────────────────────────────────────────────────────────
const LS_SESSION      = 'roulette_session';
const LS_TABLE        = 'roulette_table';
const LS_BETTING_MODE = 'roulette_betting_mode';
const LS_MIRROR_MODE  = 'roulette_mirror_mode';

function enrichSpin(s) {
  const cls = classifyNumber(s.number);
  return { ...s, ...cls };
}

export default function App() {
  const [session, setSession]               = useState(null);
  const [table, setTable]                   = useState(null);
  const [spins, setSpins]                   = useState([]);
  const [results, setResults]               = useState([]);
  const [resultsSummary, setResultsSummary] = useState(null);
  const [showManager, setShowManager]       = useState(true);
  const [loading, setLoading]               = useState(false);
  const [simulating, setSimulating]         = useState(false);
  const [passTarget, setPassTarget]         = useState(2);
  const [systemOverride, setSystemOverride] = useState(null);
  const [bettingMode, setBettingMode]       = useState(() => localStorage.getItem(LS_BETTING_MODE) || 'sectors');
  const [mirrorMode,  setMirrorMode]        = useState(() => localStorage.getItem(LS_MIRROR_MODE)  || 'color');
  const [error, setError]                   = useState('');
  const [strategyLock, setStrategyLock]     = useState(null);
  const [showImport, setShowImport]         = useState(false);
  const simRef = useRef(null);

  // Persist bettingMode
  const handleBettingModeChange = useCallback((mode) => {
    setBettingMode(mode);
    localStorage.setItem(LS_BETTING_MODE, mode);
  }, []);

  // Persist mirrorMode
  const handleMirrorModeChange = useCallback((mode) => {
    setMirrorMode(mode);
    localStorage.setItem(LS_MIRROR_MODE, mode);
  }, []);

  // ─── Derived state (zero-latency, computed locally) ───────────────────────
  const frequencies    = calculateFrequencies(spins);
  const allDelays      = calculateAllDelays(spins);
  const maxDelays      = calculateMaxDelays(spins);
  const bettingState   = computeBettingState(spins, systemOverride, passTarget);
  const jacoboState    = computeJacoboState(spins);
  const vecinosState   = computeVecinosState(spins);
  const autoSystemState = computeBestSystem(spins, passTarget, systemOverride, strategyLock);
  const hotNumbers      = useMemo(() => getHotNumbers(spins), [spins]);

  // In auto mode, use the auto-chosen mirror mode; otherwise user-chosen
  const effectiveMirrorMode = (bettingMode === 'auto' && autoSystemState?.mirrorMode)
    ? autoSystemState.mirrorMode
    : mirrorMode;
  const mirrorState    = computeMirrorState(spins, effectiveMirrorMode);
  const lastNumber     = spins.length > 0 ? spins[spins.length - 1].number : null;

  // ─── Restore last session from localStorage on mount ─────────────────────
  useEffect(() => {
    const savedSession = localStorage.getItem(LS_SESSION);
    const savedTable   = localStorage.getItem(LS_TABLE);
    if (savedSession && savedTable) {
      try {
        const s = JSON.parse(savedSession);
        const t = JSON.parse(savedTable);
        setSession(s);
        setTable(t);
        setShowManager(false);
      } catch (_) {
        localStorage.removeItem(LS_SESSION);
        localStorage.removeItem(LS_TABLE);
      }
    }
  }, []);

  // ─── Load spins + results whenever session changes ────────────────────────
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setSpins([]);
    setResults([]);
    setResultsSummary(null);

    Promise.all([
      api.getSpins(session.id),
      api.getResults(session.id),
      api.getResultsSummary(session.id)
    ])
      .then(([spinsData, resultsData, summaryData]) => {
        setSpins(spinsData.map(enrichSpin));
        setResults(resultsData);
        setResultsSummary(summaryData);
      })
      .catch(e => setError('Error cargando sesión: ' + e.message))
      .finally(() => setLoading(false));
  }, [session?.id]);

  // ─── Strategy lock: prevent AUTO MODE from switching mid-progression ─────
  useEffect(() => {
    if (bettingMode !== 'auto') { setStrategyLock(null); return; }
    if (!autoSystemState)       return;
    const { system, mirrorMode: autoMM, locked, lockReleased } = autoSystemState;
    setStrategyLock(prev => {
      // External lock says the system is still cycling — keep existing ref
      if (prev && locked && !lockReleased && prev.system === system) return prev;
      // Lock just released: if scoring found a new system, adopt it; else clear
      if (lockReleased && prev) {
        if (!system) return null;
        if (system === prev.system && autoMM === prev.mirrorMode) return prev;
        return { system, mirrorMode: autoMM ?? null };
      }
      // No prior lock: set one if a system was freshly chosen
      if (!prev && system) return { system, mirrorMode: autoMM ?? null };
      // Clear lock if no system chosen
      if (!system) return null;
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSystemState?.system, autoSystemState?.locked, autoSystemState?.lockReleased, bettingMode]);

  // Clear lock when bettingMode changes away from auto or session changes
  useEffect(() => {
    setStrategyLock(null);
  }, [session?.id]);

  // ─── Register a spin ──────────────────────────────────────────────────────
  const handleSpin = useCallback(async (number) => {
    if (!session) return;
    setError('');
    try {
      const response = await api.addSpin(
        session.id, number, passTarget, systemOverride, bettingMode,
        effectiveMirrorMode,
        bettingMode === 'auto' ? strategyLock : null
      );
      const { bet_result, ...spin } = response;
      setSpins(prev => [...prev, enrichSpin(spin)]);

      // Update performance data if a bet was tracked
      if (bet_result) {
        const newResult = {
          id: Date.now(),
          session_id: session.id,
          spin_id: spin.id,
          spin_index: spin.spin_order,
          system_type: bet_result.systemType,
          bet_sectors: bet_result.betSectors,
          bet_chips: bet_result.chips,
          multiplier: bet_result.multiplier,
          result: bet_result.result,
          payout: bet_result.payout,
          profit: bet_result.profit,
          balance_after: bet_result.balance_after,
          number: spin.number,
          color: spin.color
        };
        setResults(prev => [...prev, newResult]);
        setResultsSummary(prev => {
          if (!prev) {
            const isWin = bet_result.result === 'win';
            return {
              total_bets: 1,
              wins: isWin ? 1 : 0,
              losses: isWin ? 0 : 1,
              total_profit: bet_result.profit,
              total_wagered: bet_result.chips,
              current_balance: bet_result.balance_after,
              win_rate: isWin ? 100 : 0,
              roi: isWin ? 100 : -100
            };
          }
          const isWin = bet_result.result === 'win';
          const newWins = prev.wins + (isWin ? 1 : 0);
          const newLosses = prev.losses + (isWin ? 0 : 1);
          const newTotal = prev.total_bets + 1;
          const newProfit = prev.total_profit + bet_result.profit;
          const newWagered = prev.total_wagered + bet_result.chips;
          return {
            ...prev,
            total_bets: newTotal,
            wins: newWins,
            losses: newLosses,
            total_profit: newProfit,
            total_wagered: newWagered,
            current_balance: bet_result.balance_after,
            win_rate: parseFloat(((newWins / newTotal) * 100).toFixed(1)),
            roi: newWagered > 0 ? parseFloat(((newProfit / newWagered) * 100).toFixed(2)) : 0
          };
        });
      }
    } catch (e) {
      setError(e.message);
    }
  }, [session, passTarget, systemOverride, bettingMode, effectiveMirrorMode, strategyLock]);

  // ─── Undo last spin ───────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (!session || spins.length === 0) return;
    try {
      await api.deleteLast(session.id);
      setSpins(prev => prev.slice(0, -1));
      // Remove last result if it matches the last spin
      setResults(prev => {
        if (!prev.length) return prev;
        return prev.slice(0, -1);
      });
      // Refresh summary from server for accuracy
      api.getResultsSummary(session.id).then(setResultsSummary).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  }, [session, spins.length]);

  // ─── Session select / persist ─────────────────────────────────────────────
  const handleSessionSelect = useCallback((s, t) => {
    setSession(s);
    setTable(t);
    setShowManager(false);
    localStorage.setItem(LS_SESSION, JSON.stringify(s));
    localStorage.setItem(LS_TABLE, JSON.stringify(t));
  }, []);

  // ─── Simulation ───────────────────────────────────────────────────────────
  const toggleSimulation = useCallback(() => {
    if (simulating) {
      clearInterval(simRef.current);
      setSimulating(false);
    } else {
      if (!session) return;
      setSimulating(true);
      simRef.current = setInterval(() => { handleSpin(randomSpin()); }, 600);
    }
  }, [simulating, session, handleSpin]);

  useEffect(() => () => { if (simRef.current) clearInterval(simRef.current); }, []);

  const handleExport = () => { if (session) window.open(api.exportCSV(session.id), '_blank'); };

  // ─── Reload everything after bulk import ──────────────────────────────────
  const handleImported = useCallback(async () => {
    if (!session) return;
    try {
      const [spinsData, resultsData, summaryData] = await Promise.all([
        api.getSpins(session.id),
        api.getResults(session.id),
        api.getResultsSummary(session.id),
      ]);
      setSpins(spinsData.map(enrichSpin));
      setResults(resultsData);
      setResultsSummary(summaryData);
      setStrategyLock(null);
    } catch (e) { setError('Error recargando datos: ' + e.message); }
  }, [session]);

  // ─── Session manager screen ───────────────────────────────────────────────
  if (showManager) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <SessionManager
          onSelect={handleSessionSelect}
          currentSession={session}
          currentTable={table}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-white">🎡 ROULETTE ANALYZER</span>
          <span className="text-gray-600 hidden md:block">|</span>
          {table && <span className="text-sm text-gray-400 hidden md:block">{table.name}{table.casino ? ` — ${table.casino}` : ''}</span>}
          {session && (
            <span className="badge bg-blue-900 text-blue-300">
              Sesión #{session.id} · {spins.length} tiradas
            </span>
          )}
          {loading && <span className="text-xs text-yellow-400 animate-pulse">Cargando...</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Live balance chip */}
          {resultsSummary && resultsSummary.total_bets > 0 && (
            <div className={`hidden lg:flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-bold border ${
              resultsSummary.total_profit >= 0
                ? 'bg-green-900/40 text-green-400 border-green-700'
                : 'bg-red-900/40 text-red-400 border-red-700'
            }`}>
              {resultsSummary.total_profit >= 0 ? '+' : ''}{resultsSummary.total_profit} fichas
              &nbsp;·&nbsp;ROI {resultsSummary.roi}%
            </div>
          )}

          {bettingState?.active && (
            <div className="hidden xl:flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-bold bg-blue-900/40 text-blue-400 border border-blue-700">
              ⚡ {bettingState.systemType} S{bettingState.targetSectors?.join('+')} · {bettingState.currentChips} fich.
            </div>
          )}

          <button
            onClick={() => setShowImport(true)}
            disabled={!session}
            className="btn-ghost text-xs disabled:opacity-30"
            title="Importar historial de números"
          >
            📥 Importar
          </button>
          <button onClick={handleExport} disabled={!session || spins.length === 0} className="btn-ghost text-xs disabled:opacity-30">
            ↓ CSV
          </button>
          <button
            onClick={toggleSimulation}
            disabled={!session}
            className={`btn text-xs disabled:opacity-30 ${simulating ? 'bg-orange-700 hover:bg-orange-600 text-white' : 'btn-ghost'}`}
          >
            {simulating ? '⏹ Stop' : '▶ Simular'}
          </button>
          <button onClick={() => setShowManager(true)} className="btn-ghost text-xs">⚙ Sesiones</button>
        </div>
      </header>

      {/* ── Error bar ── */}
      {error && (
        <div className="bg-red-900/40 border-b border-red-800 px-4 py-1 text-red-400 text-xs flex justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-300 hover:text-white ml-2">×</button>
        </div>
      )}

      {/* ── Main grid ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] xl:grid-cols-[320px_1fr_320px] gap-3 p-3 overflow-auto min-h-0">

        {/* LEFT — Input + History */}
        <div className="flex flex-col gap-3 min-w-0">
          <NumberPad onSpin={handleSpin} lastNumber={lastNumber} disabled={loading || simulating} />
          <SpinHistory spins={spins} onUndo={handleUndo} />
        </div>

        {/* CENTER — Betting + Performance + Stats */}
        <div className="flex flex-col gap-3 min-w-0">
          <BettingPanel
            bettingState={bettingState}
            passTarget={passTarget}
            onPassTargetChange={setPassTarget}
            systemOverride={systemOverride}
            onSystemOverride={setSystemOverride}
            jacoboState={jacoboState}
            mirrorState={mirrorState}
            vecinosState={vecinosState}
            autoSystemState={autoSystemState}
            bettingMode={bettingMode}
            onBettingModeChange={handleBettingModeChange}
            mirrorMode={effectiveMirrorMode}
            onMirrorModeChange={handleMirrorModeChange}
          />
          <PerformancePanel results={results} summary={resultsSummary} />
          {/* Heatmap de cilindro y backtester solo cuando modo VECINOS está activo */}
          {(bettingMode === 'vecinos' || (bettingMode === 'auto' && autoSystemState?.system === 'VECINOS')) && (
            <>
              <CylinderHeatmapVecinos
                spins={spins}
                activeZone={vecinosState?.zone ?? null}
              />
              <VecinosBacktestPanel spins={spins} />
            </>
          )}
          <StatsPanel spins={spins} />
          <BiasPanel spins={spins} />
        </div>

        {/* RIGHT — Cylinder + Delays */}
        <div className="flex flex-col gap-3 min-w-0">
          <CylinderHeatmap frequencies={frequencies} totalSpins={spins.length} />
          <DelayPanel
            allDelays={allDelays}
            maxDelays={maxDelays}
            totalSpins={spins.length}
          />
          <HotNumbersPanel
            hotNumbers={hotNumbers}
            spinsCount={spins.length}
            tableId={table?.id}
          />
          <TableMemoryPanel tableId={table?.id} />
        </div>
      </main>

      {/* ── Import modal ── */}
      {showImport && session && (
        <ImportModal
          session={session}
          spinsCount={spins.length}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); handleImported(); }}
        />
      )}
    </div>
  );
}
