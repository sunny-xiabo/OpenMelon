import { API_BASE, fetchJSON } from './client';

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
};
