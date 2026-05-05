// ── Base URL ──────────────────────────────────────────────────────────────────
// VITE_API_URL is injected at BUILD TIME by Vite from the platform env vars.
// Vercel: set VITE_API_URL=https://your-app.up.railway.app/api in project settings.
// Local dev: leave unset → Vite proxy forwards /api/* to localhost:3001.
const BASE = import.meta.env.VITE_API_URL || '/api';

// ── Core fetch wrapper ────────────────────────────────────────────────────────
export async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}

// ── Convenience helpers ───────────────────────────────────────────────────────
const get  = (path)       => apiFetch(path);
const post = (path, body) => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
const put  = (path, body) => apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) });
const del  = (path)       => apiFetch(path, { method: 'DELETE' });

// ── API methods ───────────────────────────────────────────────────────────────
export const api = {
  // Tables
  getTables:     ()                => get('/tables'),
  createTable:   (data)            => post('/tables', data),
  deleteTable:   (id)              => del(`/tables/${id}`),

  // Sessions
  getSessions:   (tableId)         => get(`/sessions?tableId=${tableId}`),
  createSession: (tableId, name)   => post('/sessions', { tableId, name }),
  endSession:    (id)              => put(`/sessions/${id}/end`),
  deleteSession: (id)              => del(`/sessions/${id}`),

  // Spins
  getSpins:      (sessionId)       => get(`/spins?sessionId=${sessionId}&limit=10000`),
  addSpin:       (sessionId, number, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color') =>
    post('/spins', { sessionId, number, passTarget, systemType, bettingMode, mirrorMode }),
  deleteLast:    (sessionId)       => del(`/spins/last?sessionId=${sessionId}`),
  bulkSpins:     (sessionId, numbers, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color') =>
    post('/spins/bulk', { sessionId, numbers, passTarget, systemType, bettingMode, mirrorMode }),

  // Results
  getResults:        (sessionId)              => get(`/results/session/${sessionId}`),
  getResultsSummary: (sessionId)              => get(`/results/session/${sessionId}/summary`),

  // Hot Windows
  getHotWindows: (tableId) => get(`/hot-windows/${tableId}`),

  // Analysis
  getAnalysis: (sessionId, systemType, passTarget) => {
    let url = `/analysis/session/${sessionId}?passTarget=${passTarget}`;
    if (systemType) url += `&systemType=${systemType}`;
    return get(url);
  },
  getBias:     (tableId)  => get(`/analysis/bias/${tableId}`),
  exportCSV:   (sessionId) => `${BASE}/analysis/export/${sessionId}`,
};
