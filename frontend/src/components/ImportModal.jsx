import { useState, useMemo } from 'react';
import { api } from '../utils/api';

// ─── Parsear el texto pegado por el usuario ────────────────────────────────────
function parseNumbers(raw) {
  const tokens = raw.split(/[\s,;]+/);
  const valid = [];
  const invalid = [];

  for (const tok of tokens) {
    if (!tok.trim()) continue;
    const n = parseInt(tok, 10);
    if (isNaN(n) || n < 0 || n > 36 || tok.trim() !== String(n)) {
      invalid.push(tok.trim());
    } else {
      valid.push(n);
    }
  }
  return { valid, invalid };
}

// ─── Número coloreado ─────────────────────────────────────────────────────────
const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function NumBadge({ n }) {
  const cls = n === 0
    ? 'bg-green-700 text-white'
    : REDS.has(n)
    ? 'bg-red-700 text-white'
    : 'bg-gray-700 text-white';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${cls}`}>
      {n}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ImportModal({ session, spinsCount, onClose, onImported }) {
  const [raw, setRaw]                   = useState('');
  const [newestFirst, setNewestFirst]   = useState(true);
  const [replaceMode, setReplaceMode]   = useState('append'); // 'append' | 'replace'
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState(null); // { ok, message }

  // ── Parse en tiempo real ──
  const parsed = useMemo(() => parseNumbers(raw), [raw]);
  const ordered = useMemo(
    () => newestFirst ? [...parsed.valid].reverse() : parsed.valid,
    [parsed.valid, newestFirst]
  );

  const canImport = ordered.length > 0 && parsed.invalid.length === 0 && !loading;

  async function handleImport() {
    if (!canImport) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api.importSpins(session.id, ordered, replaceMode === 'replace');
      setResult({ ok: true, message: `✅ ${res.message}` });
      onImported?.();
    } catch (e) {
      setResult({ ok: false, message: `❌ ${e.message}` });
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">📥 Importar historial</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sesión #{session.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* ── Contenido scrollable ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Textarea */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">
              Pegá los números (separados por espacios, saltos de línea o comas):
            </label>
            <textarea
              value={raw}
              onChange={e => { setRaw(e.target.value); setResult(null); }}
              rows={7}
              placeholder={`Ejemplo:\n30 28 24 30 10 11 27\n28 28 33 4 1 21 14\n31 23 31 2 27 29 9`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 font-mono resize-y focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Checkbox: orden */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={newestFirst}
              onChange={e => setNewestFirst(e.target.checked)}
              className="mt-0.5 accent-blue-500"
            />
            <span className="text-sm text-gray-300">
              La lista comienza por el número <span className="font-bold text-white">MÁS RECIENTE</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                (el sistema invertirá el orden antes de guardar — como en las capturas de ruleta)
              </span>
            </span>
          </label>

          {/* Errores de validación */}
          {parsed.invalid.length > 0 && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-xs text-red-400">
              ❌ Números inválidos (fuera de 0-36): <span className="font-mono font-bold">{parsed.invalid.join(', ')}</span>
            </div>
          )}

          {/* Preview */}
          {ordered.length > 0 && parsed.invalid.length === 0 && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="text-xs text-gray-400 font-semibold">Vista previa</div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-gray-900 rounded-lg p-2">
                  <div className="text-gray-500">Primer histórico</div>
                  <div className="mt-1 flex justify-center"><NumBadge n={ordered[0]} /></div>
                </div>
                <div className="bg-gray-900 rounded-lg p-2">
                  <div className="text-gray-500">Último histórico</div>
                  <div className="mt-1 flex justify-center"><NumBadge n={ordered[ordered.length - 1]} /></div>
                </div>
                <div className="bg-gray-900 rounded-lg p-2">
                  <div className="text-gray-500">Total spins</div>
                  <div className="text-lg font-black text-blue-400 mt-0.5">{ordered.length}</div>
                </div>
              </div>
              {/* mini preview de los primeros/últimos */}
              <div className="text-xs text-gray-600">
                Orden guardado: {ordered.slice(0, 8).join(' · ')}{ordered.length > 8 ? ' · …' : ''}
              </div>
            </div>
          )}

          {/* Agregar vs reemplazar */}
          {spinsCount > 0 && ordered.length > 0 && (
            <div className="border border-yellow-700/50 bg-yellow-900/10 rounded-lg p-3">
              <div className="text-xs font-semibold text-yellow-400 mb-2">
                ⚠️ Esta sesión ya tiene {spinsCount} tirada{spinsCount !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1.5">
                {[
                  ['append',  '➕ Agregar al historial existente'],
                  ['replace', '🔄 Reemplazar todo el historial'],
                ].map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="replaceMode"
                      value={val}
                      checked={replaceMode === val}
                      onChange={() => setReplaceMode(val)}
                      className="accent-blue-500"
                    />
                    <span className={`text-sm ${replaceMode === val ? 'text-white' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              {replaceMode === 'replace' && (
                <div className="text-xs text-red-400 mt-2">
                  ⛔ Se eliminarán permanentemente las {spinsCount} tiradas existentes
                </div>
              )}
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg px-3 py-2.5 text-sm font-semibold border ${
              result.ok
                ? 'bg-green-900/30 border-green-700 text-green-400'
                : 'bg-red-900/30 border-red-700 text-red-400'
            }`}>
              {result.message}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm font-semibold hover:bg-gray-700 transition-colors"
          >
            {result?.ok ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result?.ok && (
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? '⏳ Importando...'
                : `📥 Importar ${ordered.length > 0 ? ordered.length + ' números' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
