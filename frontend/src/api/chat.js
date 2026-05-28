import { API_BASE, fetchJSON, fetchStream, fetchFormData } from './client';

export const chatAPI = {
  query: (message, sessionId = null, includeHistory = true) => {
    const params = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return fetchJSON(`${API_BASE}/query${params}`, {
      method: 'POST',
      body: JSON.stringify({ question: message, include_history: includeHistory }),
    });
  },

  queryStream: (message, sessionId = null, includeHistory = true) => {
    const params = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return fetchStream(`${API_BASE}/query/stream${params}`, {
      method: 'POST',
      body: JSON.stringify({ question: message, include_history: includeHistory }),
      timeoutMs: 0,
    });
  },

  queryStreamWithFiles: (question, files, sessionId = null, includeHistory = true) => {
    const formData = new FormData();
    formData.append('question', question);
    formData.append('include_history', String(includeHistory));
    if (sessionId) formData.append('session_id', sessionId);
    files.forEach(f => formData.append('files', f));
    return fetchFormData(`${API_BASE}/query/stream`, formData, { timeoutMs: 0 });
  },

  setFeedback: (sessionId, messageIndex, feedback) =>
    fetchJSON(`${API_BASE}/query/feedback`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, message_index: messageIndex, feedback }),
    }),

  getFeedback: (sessionId) =>
    fetchJSON(`${API_BASE}/query/feedback/${encodeURIComponent(sessionId)}`),

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
