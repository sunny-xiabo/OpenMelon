import { API_BASE, fetchJSON, fetchStream } from './client';

export const configCenterAPI = {
  getSchema: () => fetchJSON(`${API_BASE}/config-center/schema`),
  getValues: () => fetchJSON(`${API_BASE}/config-center/values`),
  listProviders: () => fetchJSON(`${API_BASE}/config-center/providers`),
  validateValues: (values) =>
    fetchJSON(`${API_BASE}/config-center/validate`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    }),
  previewValues: (values) =>
    fetchJSON(`${API_BASE}/config-center/preview`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    }),
  saveValues: (values) =>
    fetchJSON(`${API_BASE}/config-center/values`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }),
  initialize: ({ mode = 'from_example', values = {} }) =>
    fetchJSON(`${API_BASE}/config-center/initialize`, {
      method: 'POST',
      body: JSON.stringify({ mode, values }),
    }),
  saveProvider: (provider) =>
    fetchJSON(`${API_BASE}/config-center/providers`, {
      method: 'POST',
      body: JSON.stringify(provider),
    }),
  deleteProvider: (providerKey) =>
    fetchJSON(`${API_BASE}/config-center/providers/${encodeURIComponent(providerKey)}`, {
      method: 'DELETE',
    }),
  getSlotConfig: () => fetchJSON(`${API_BASE}/test-cases/model-presets/slot-config`),
  saveSlotConfig: (slots) =>
    fetchJSON(`${API_BASE}/test-cases/model-presets/slot-config`, {
      method: 'PUT',
      body: JSON.stringify({ slots }),
    }),
  exportConfig: async () => {
    const resp = await fetchStream(`${API_BASE}/config-center/export`);
    return resp.text();
  },
  importConfig: (content) =>
    fetchJSON(`${API_BASE}/config-center/import`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  listBackups: () =>
    fetchJSON(`${API_BASE}/config-center/backups`),
  readBackup: (filename) =>
    fetchJSON(`${API_BASE}/config-center/backups/${encodeURIComponent(filename)}`),
  restoreBackup: (filename) =>
    fetchJSON(`${API_BASE}/config-center/backups/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
    }),
};
