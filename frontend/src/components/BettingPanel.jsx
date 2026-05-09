import { getSectorStreets, PRE_ANALYSIS_WINDOW, PROGRESSION_TABLES } from '../utils/roulette';
import JacoboPanel   from './JacoboPanel';
import MirrorPanel   from './MirrorPanel';
import VecinosPanel  from './VecinosPanel';
import AutoModePanel from './AutoModePanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ResultPill({ r }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black
      ${r === 'win' ? 'bg-green-600' : 'bg-red-700'} text-white`}>
      {r === 'win' ? 'G' : 'P'}
    </span>
  );
}

function SectorCard({ systemType, sector }) {
  const streets = getSectorStreets(systemType, sector);
  return (
    <div className="rounded-xl border-2 border-blue-500 bg-blue-900/20 p-3">
      <div className="text-xs font-semibold text-blue-300 mb-2">{systemType} · Sector {sector}</div>
      <div className="flex flex-col gap-1">
        {streets.map((street, i) => (
          <div key={i} className="flex gap-1 items-center">
            {street.map(n => (
              <span key={n} className="flex-1 text-center text-xs bg-gray-700 rounded py-0.5 font-mono font-bold text-gray-100">{n}</span>
            ))}
            <span className="text-gray-500 text-xs ml-1">1fch</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ball dot for mini progression view ──────────────────────────────────────
const BET_COLOR = { calles: 'bg-blue-500', plenos: 'bg-yellow-500', mixto: 'bg-purple-500' };

function BallDot({ state, isCurrent }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${isCurrent ? 'opacity-100 scale-110' : 'opacity-35'}`}
         title={`Bola ${state.ball}: ${state.desc}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
        ${isCurrent
          ? (BET_COLOR[state.betType] || 'bg-blue-500') + ' text-white ring-2 ring-white'
          : 'bg-gray-700 text-gray-500'}`}>
        {state.ball}
      </div>
      <span className="text-xs text-gray-600">{state.chips}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// ─── Mode tab button ──────────────────────────────────────────────────────────
function ModeTab({ label, active, onClick, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-700 text-white border-blue-500',
    yellow: 'bg-yellow-700 text-white border-yellow-500',
    cyan:   'bg-cyan-700 text-white border-cyan-500',
    orange: 'bg-orange-700 text-white border-orange-500',
    green:  'bg-green-700 text-white border-green-500',
  };
  return (
    <button onClick={onClick}
      className={`flex-1 py-1 px-1 text-xs font-bold rounded border transition-all
        ${active ? colors[color] : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}`}>
      {label}
    </button>
  );
}

export default function BettingPanel({
  // Sectors mode
  bettingState, passTarget, onPassTargetChange, systemOverride, onSystemOverride,
  // Individual systems
  jacoboState, mirrorState, vecinosState,
  // Auto mode
  autoSystemState,
  // Mode control
  bettingMode = 'sectors', onBettingModeChange,
  mirrorMode = 'color', onMirrorModeChange,
  // VECINOS Fase 3
  historicalBlocks = [], vecinosBettingType = 'progressive', onVecinosBettingTypeChange,
}) {
  // ── Mode selector (always shown, even with no session) ──
  const modeSelector = (
    <div className="flex gap-1 mb-1 flex-wrap">
      <ModeTab label="🎯 Sectores" active={bettingMode === 'sectors'} onClick={() => onBettingModeChange('sectors')} color="blue"   />
      <ModeTab label="⚡ Jacobo"   active={bettingMode === 'jacobo'}  onClick={() => onBettingModeChange('jacobo')}  color="yellow" />
      <ModeTab label="🪞 Espejo"   active={bettingMode === 'mirror'}  onClick={() => onBettingModeChange('mirror')}  color="cyan"   />
      <ModeTab label="🌊 Vecinos"  active={bettingMode === 'vecinos'} onClick={() => onBettingModeChange('vecinos')} color="green"  />
      <ModeTab label="🤖 Auto"     active={bettingMode === 'auto'}    onClick={() => onBettingModeChange('auto')}    color="orange" />
    </div>
  );

  if (!bettingState && bettingMode === 'sectors') {
    return (
      <div className="card">
        <div className="card-title">🎯 Sistema de Apuesta</div>
        {modeSelector}
        <p className="text-gray-500 text-sm text-center py-6">Inicia una sesión y registra tiradas</p>
      </div>
    );
  }

  // ── Jacobo mode ──
  if (bettingMode === 'jacobo') {
    return (
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="card-title mb-0">🎯 Sistema de Apuesta</span>
        </div>
        {modeSelector}
        <JacoboPanel state={jacoboState} />
      </div>
    );
  }

  // ── Mirror mode ──
  if (bettingMode === 'mirror') {
    return (
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="card-title mb-0">🎯 Sistema de Apuesta</span>
        </div>
        {modeSelector}
        <MirrorPanel state={mirrorState} mirrorMode={mirrorMode} onMirrorModeChange={onMirrorModeChange} />
      </div>
    );
  }

  // ── Vecinos mode ──
  if (bettingMode === 'vecinos') {
    return (
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="card-title mb-0">🎯 Sistema de Apuesta</span>
        </div>
        {modeSelector}
        <VecinosPanel
          state={vecinosState}
          historicalBlocks={historicalBlocks}
          bettingType={vecinosBettingType}
          onBettingTypeChange={onVecinosBettingTypeChange}
        />
      </div>
    );
  }

  // ── Auto mode ──
  if (bettingMode === 'auto') {
    const autoSystem   = autoSystemState?.system;
    const autoMirMode  = autoSystemState?.mirrorMode || 'color';
    return (
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="card-title mb-0">🎯 Sistema de Apuesta</span>
        </div>
        {modeSelector}
        <AutoModePanel autoState={autoSystemState} />

        {/* Sub-panel del sistema activo */}
        {autoSystem === 'ESPEJO' && (
          <>
            <div className="border-t border-gray-800" />
            <div className="text-xs text-gray-600 text-center -mb-1">
              Modo: {autoMirMode === 'color' ? 'Color' : autoMirMode === 'parity' ? 'Paridad' : 'Rango'}
            </div>
            <MirrorPanel state={mirrorState} mirrorMode={autoMirMode} hideSelector />
          </>
        )}

        {autoSystem === 'JACOBO' && (
          <>
            <div className="border-t border-gray-800" />
            <JacoboPanel state={jacoboState} />
          </>
        )}

        {autoSystem === 'VECINOS' && (
          <>
            <div className="border-t border-gray-800" />
            <VecinosPanel
              state={vecinosState}
              historicalBlocks={historicalBlocks}
              bettingType={vecinosBettingType}
              onBettingTypeChange={onVecinosBettingTypeChange}
            />
          </>
        )}

        {autoSystem === 'SECTORES' && bettingState?.active && (
          <>
            <div className="border-t border-gray-800" />
            <div className="rounded-xl p-3 border-2 border-blue-500 bg-blue-900/20 text-center">
              <div className="text-xs text-blue-300 mb-1">{bettingState.systemType} · {bettingState.targetSectors?.join('+')}</div>
              <div className="text-3xl font-black text-blue-400">
                Bola {bettingState.currentBall}/{bettingState.totalBalls}
              </div>
              <div className="text-gray-300 mt-1 font-bold">{bettingState.currentChips} fichas</div>
              <div className="text-gray-500 text-xs mt-0.5">{bettingState.betDesc}</div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Sectors mode (A4) ──
  if (!bettingState) {
    return (
      <div className="card">
        <div className="card-title">🎯 Sistema de Apuesta</div>
        {modeSelector}
        <p className="text-gray-500 text-sm text-center py-4">Inicia una sesión y registra tiradas</p>
      </div>
    );
  }

  const {
    active, reason, spinsNeeded, systemType, autoSystem, analysis,
    targetSectors, currentBall, totalBalls, currentChips,
    betType, betDesc, baseChips,
    consecutiveWins = 0, winsNeeded = 2, winsRequired = 2, winMultiplier = 1,
    onWin, onLoss, isLastBall,
    cyclesCompleted, cyclesAborted,
    currentCycleHistory, currentCycleInvested, dataQuality
  } = bettingState;

  const table = PROGRESSION_TABLES[passTarget] || PROGRESSION_TABLES[2];
  const isTwoPass  = passTarget === 2;
  const isThreePass = passTarget === 3;

  const betTypeLabel = { calles: '🎰 Calles', plenos: '🎯 Plenos', mixto: '🎲 Mixto' };
  const betTypeColor = { calles: 'text-blue-400', plenos: 'text-yellow-400', mixto: 'text-purple-400' };

  return (
    <div className="card flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-2">
        <span className="card-title mb-0">🎯 Sistema de Apuesta</span>
        {modeSelector}
        <div className="flex gap-2">
          <select value={passTarget} onChange={e => onPassTargetChange(parseInt(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
            <option value={2}>2 Pases (9 bolas)</option>
            <option value={3}>3 Pases (15 bolas)</option>
          </select>
          <select value={systemOverride || 'auto'} onChange={e => onSystemOverride(e.target.value === 'auto' ? null : e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
            <option value="auto">Auto ({autoSystem || '?'})</option>
            <option value="A4">A4</option>
          </select>
        </div>
      </div>

      {/* ── Waiting for pre-analysis ── */}
      {!active ? (
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <div className="text-4xl mb-2">⏳</div>
          <div className="text-gray-300 font-semibold mb-1">{reason}</div>
          {spinsNeeded > 0 && (
            <div className="text-gray-500 text-sm">
              Faltan <span className="text-blue-400 font-bold">{spinsNeeded}</span> tiradas para el pre-análisis
            </div>
          )}
          <div className="mt-3 bg-gray-900 rounded-lg p-2 text-xs text-gray-500">
            El sistema requiere {PRE_ANALYSIS_WINDOW} tiradas previas para analizar A4 y detectar la secuencia óptima.
          </div>
        </div>
      ) : (
        <>
          {/* ── Pre-analysis result ── */}
          {analysis && (
            <div className={`rounded-lg p-2.5 border text-xs ${analysis.isConclusive ? 'border-green-700 bg-green-900/20' : 'border-yellow-700 bg-yellow-900/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white">
                  {analysis.isConclusive ? '✅' : '⚠️'} Sistema: <span className="text-blue-300">{systemType}</span>
                </span>
                <span className={`text-xs ${analysis.isConclusive ? 'text-green-400' : 'text-yellow-400'}`}>
                  {analysis.confidence}% confianza
                </span>
              </div>
              <div className="text-gray-400">{analysis.reason}</div>
            </div>
          )}

          {/* ── Main signal ── */}
          <div className="rounded-xl p-4 text-center border-2 border-green-500 bg-green-900/20">
            <div className="text-3xl font-black text-green-400 tracking-wider">⚡ APOSTAR</div>
            <div className="text-gray-400 text-sm mt-1">
              {systemType} · {isTwoPass ? '2 Pases' : '3 Pases'}
            </div>
          </div>

          {/* ── Sectors ── */}
          {targetSectors && (
            <div className="grid grid-cols-2 gap-3">
              {targetSectors.map(s => <SectorCard key={s} systemType={systemType} sector={s} />)}
            </div>
          )}

          {/* ── Stats: bola / fichas / invertido ── */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-xs text-gray-400">Bola actual</div>
              <div className="text-xl font-black text-blue-400">{currentBall}/{totalBalls}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-xs text-gray-400">Fichas</div>
              <div className="text-xl font-black text-yellow-400">{currentChips}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2">
              <div className="text-xs text-gray-400">Invertido</div>
              <div className="text-xl font-black text-orange-400">{currentCycleInvested}</div>
            </div>
          </div>

          {/* ── Bet type badge ── */}
          <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
            <span className={`text-sm font-bold ${betTypeColor[betType] || 'text-gray-300'}`}>
              {betTypeLabel[betType] || betType}
            </span>
            <div className="text-xs text-gray-500 mt-0.5">{betDesc}</div>
          </div>

          {/* ── Aciertos consecutivos requeridos (ambos sistemas) ── */}
          <div className="bg-gray-800/60 rounded-lg p-2.5">
            <div className="text-xs text-gray-400 mb-2">
              Aciertos consecutivos requeridos ({winsRequired} pases)
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: winsRequired }, (_, i) => {
                const base = baseChips || currentChips;
                const chipsAtLevel = base * Math.pow(2, i);
                const isCompleted = i < consecutiveWins;
                const isCurrent   = i === consecutiveWins;
                return (
                  <div key={i} className={`flex-1 text-center rounded p-1.5 text-xs font-bold transition-all
                    ${isCompleted ? 'bg-green-700 text-white' : isCurrent ? 'bg-blue-700 border border-blue-400 text-white' : 'bg-gray-700 text-gray-500'}`}>
                    ×{Math.pow(2, i)}
                    <div className="text-xs font-normal opacity-80 mt-0.5">{Math.round(chipsAtLevel)}f</div>
                    {isCompleted && <div className="text-xs">✓</div>}
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 mt-1.5 text-center">
              {consecutiveWins}/{winsRequired} aciertos · {winsNeeded} restante(s) para completar
            </div>
          </div>

          {/* ── Win / Loss outcomes ── */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg p-2 border border-green-700 bg-green-900/10">
              <div className="text-green-400 font-semibold mb-1">Si GANA →</div>
              <div className="text-gray-300">{onWin}</div>
            </div>
            <div className={`rounded-lg p-2 border ${isLastBall ? 'border-red-700 bg-red-900/20' : 'border-gray-700 bg-gray-800'}`}>
              <div className="text-red-400 font-semibold mb-1">Si PIERDE →</div>
              {onLoss === 'stop'
                ? <div className="text-red-300 font-bold">⛔ STOP — Reiniciar ciclo</div>
                : <div className="text-gray-300">{onLoss}</div>
              }
            </div>
          </div>

          {/* ── Mini ball progression ── */}
          <div>
            <div className="text-xs text-gray-400 mb-1.5 flex items-center gap-2">
              <span>Progresión ({isTwoPass ? '9 bolas' : '15 bolas'}):</span>
              <span className="text-blue-400">■ calles</span>
              <span className="text-yellow-400">■ plenos</span>
              <span className="text-purple-400">■ mixto</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {table.map(s => (
                <BallDot key={s.ball} state={s} isCurrent={s.ball === currentBall} />
              ))}
            </div>
          </div>

          {/* ── Cycle history pills ── */}
          {currentCycleHistory?.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Ciclo actual:</div>
              <div className="flex flex-wrap gap-1">
                {currentCycleHistory.map((r, i) => (
                  <ResultPill key={i} r={r.result} />
                ))}
              </div>
            </div>
          )}

          {/* ── Counters ── */}
          <div className="flex gap-3 text-xs text-gray-500 border-t border-gray-800 pt-2">
            <span>✅ Completos: <span className="text-green-400 font-bold">{cyclesCompleted}</span></span>
            <span>⛔ Abortados: <span className="text-red-400 font-bold">{cyclesAborted}</span></span>
          </div>
        </>
      )}

      {/* ── Data quality ── */}
      {dataQuality && (
        <div className={`text-xs font-semibold ${dataQuality.tw}`}>
          {dataQuality.emoji} {dataQuality.label}
        </div>
      )}
    </div>
  );
}
