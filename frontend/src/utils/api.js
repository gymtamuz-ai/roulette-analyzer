// In production: VITE_API_URL=https://my-backend.railway.app/api
// In dev: unset → Vite proxy forwards /api → localhost:3001/api
const BASE = import.meta.env.VITE_API_URL || '/api';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Tables
  getTables: () => req('GET', '/tables'),
  createTable: (data) => req('POST', '/tables', data),
  deleteTable: (id) => req('DELETE', `/tables/${id}`),

  // Sessions
  getSessions: (tableId) => req('GET', `/sessions?tableId=${tableId}`),
  createSession: (tableId, name) => req('POST', '/sessions', { tableId, name }),
  endSession: (id) => req('PUT', `/sessions/${id}/end`),
  deleteSession: (id) => req('DELETE', `/sessions/${id}`),

  // Spins — always fetch all (up to 10000) for full persistence
  getSpins: (sessionId) => req('GET', `/spins?sessionId=${sessionId}&limit=10000`),
  addSpin: (sessionId, number, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color') =>
    req('POST', '/spins', { sessionId, number, passTarget, systemType, bettingMode, mirrorMode }),
  deleteLast: (sessionId) => req('DELETE', `/spins/last?sessionId=${sessionId}`),
  bulkSpins: (sessionId, numbers, passTarget = 2, systemType = null, bettingMode = 'sectors', mirrorMode = 'color') =>
    req('POST', '/spins/bulk', { sessionId, numbers, passTarget, systemType, bettingMode, mirrorMode }),

  // Results & performance
  getResults: (sessionId) => req('GET', `/results/session/${sessionId}`),
  getResultsSummary: (sessionId) => req('GET', `/results/session/${sessionId}/summary`),

  // Analysis
  getAnalysis: (sessionId, systemType, passTarget) => {
    let url = `/analysis/session/${sessionId}?passTarget=${passTarget}`;
    if (systemType) url += `&systemType=${systemType}`;
    return req('GET', url);
  },
  getBias: (tableId) => req('GET', `/analysis/bias/${tableId}`),
  exportCSV: (sessionId) => `${BASE}/analysis/export/${sessionId}`
};
