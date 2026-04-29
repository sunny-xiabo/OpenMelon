import { API_BASE, fetchJSON, fetchJSONWithTimeout, fetchBlob, OPENAPI_PARSE_TIMEOUT_MS } from './client';

export const chatAPI = {
  query: (message, sessionId = null, includeHistory = true) => {
    const params = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return fetchJSON(`${API_BASE}/query${params}`, {
      method: 'POST',
      body: JSON.stringify({ question: message, include_history: includeHistory }),
    });
  },

  getSessions: () =>
    fetchJSON(`${API_BASE}/sessions`),

  getHistory: (sessionId) =>
    fetchJSON(`${API_BASE}/history/${encodeURIComponent(sessionId)}`),

  deleteSession: (sessionId) =>
    fetchJSON(`${API_BASE}/history/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),

  renameSession: (sessionId, title) =>
    fetchJSON(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
};

