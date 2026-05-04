import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function SessionManager({ onSelect, currentSession, currentTable }) {
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [newTableName, setNewTableName] = useState('');
  const [newTableCasino, setNewTableCasino] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('session'); // 'session' | 'table'

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (selectedTable) loadSessions(selectedTable.id);
  }, [selectedTable]);

  async function loadTables() {
    try {
      const data = await api.getTables();
      setTables(data);
      if (data.length > 0 && !selectedTable) {
        const t = currentTable || data[0];
        setSelectedTable(t);
      }
    } catch (e) {
      setError('Error cargando mesas: ' + e.message);
    }
  }

  async function loadSessions(tableId) {
    try {
      const data = await api.getSessions(tableId);
      setSessions(data);
    } catch (e) {
      setError('Error cargando sesiones');
    }
  }

  async function createTable(e) {
    e.preventDefault();
    if (!newTableName.trim()) return;
    setLoading(true);
    try {
      const t = await api.createTable({ name: newTableName, casino: newTableCasino });
      setTables(prev => [t, ...prev]);
      setSelectedTable(t);
      setNewTableName(''); setNewTableCasino('');
      setTab('session');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function createSession(e) {
    e.preventDefault();
    if (!selectedTable) return;
    setLoading(true);
    try {
      const s = await api.createSession(selectedTable.id, newSessionName || `Sesión ${new Date().toLocaleTimeString()}`);
      setSessions(prev => [s, ...prev]);
      setNewSessionName('');
      onSelect(s, selectedTable);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function resumeSession(session) {
    const table = tables.find(t => t.id === session.table_id);
    if (table) onSelect(session, table);
  }

  async function deleteSession(id, e) {
    e.stopPropagation();
    if (!confirm('¿Eliminar sesión?')) return;
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg mx-auto shadow-2xl">
      <h2 className="text-lg font-bold text-white mb-4">🎰 Roulette Analyzer Pro</h2>

      {error && <div className="bg-red-900/30 border border-red-700 rounded p-2 text-red-400 text-xs mb-3">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 p-1 rounded-lg">
        {[['session', '▶ Sesión'], ['table', '+ Nueva Mesa']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-1.5 rounded text-xs font-semibold transition-all ${tab === key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'session' && (
        <div className="space-y-4">
          {/* Table selector */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Mesa</label>
            <select
              value={selectedTable?.id || ''}
              onChange={e => {
                const t = tables.find(t => t.id === parseInt(e.target.value));
                setSelectedTable(t);
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {tables.map(t => (
                <option key={t.id} value={t.id}>{t.name} {t.casino ? `— ${t.casino}` : ''}</option>
              ))}
            </select>
          </div>

          {/* New session */}
          <form onSubmit={createSession} className="flex gap-2">
            <input
              value={newSessionName}
              onChange={e => setNewSessionName(e.target.value)}
              placeholder="Nombre de sesión (opcional)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <button type="submit" disabled={loading || !selectedTable} className="btn-primary whitespace-nowrap disabled:opacity-40">
              Nueva sesión
            </button>
          </form>

          {/* Sessions list */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Sesiones guardadas ({sessions.length})</div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {sessions.length === 0 && <p className="text-gray-600 text-xs text-center py-3">Sin sesiones</p>}
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => resumeSession(s)}
                  className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all hover:bg-gray-800 ${
                    currentSession?.id === s.id ? 'border-blue-600 bg-blue-900/20' : 'border-gray-800'
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium text-white">{s.name || `Sesión #${s.id}`}</div>
                    <div className="text-xs text-gray-500">
                      {parseInt(s.spin_count)} tiradas · {new Date(s.started_at).toLocaleDateString()}
                      {s.is_active && <span className="ml-2 text-green-400">● activa</span>}
                    </div>
                  </div>
                  <button onClick={e => deleteSession(s.id, e)} className="text-gray-600 hover:text-red-400 text-lg px-1">×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'table' && (
        <form onSubmit={createTable} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Nombre de la mesa *</label>
            <input
              value={newTableName}
              onChange={e => setNewTableName(e.target.value)}
              placeholder="Mesa 1, Ruleta VIP..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Casino (opcional)</label>
            <input
              value={newTableCasino}
              onChange={e => setNewTableCasino(e.target.value)}
              placeholder="Casino Royale..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            Crear mesa
          </button>
        </form>
      )}
    </div>
  );
}
