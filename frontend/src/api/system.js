import { API_BASE, fetchJSON } from './client';

export const logsAPI = {
  list: () => fetchJSON(`${API_BASE}/logs/list`),
  get: (filename = 'openmelon.log', lines = 100) =>
    fetchJSON(`${API_BASE}/logs?filename=${filename}&lines=${lines}`),
};

export const systemAPI = {
  health: () => fetchJSON(`${API_BASE}/system/health`),
};

export const webhookAPI = {
  send: (platform, question, answer) =>
    fetchJSON(`${API_BASE}/webhook/${platform}`, {
      method: 'POST',
      body: JSON.stringify({ question, answer }),
    }),
};
