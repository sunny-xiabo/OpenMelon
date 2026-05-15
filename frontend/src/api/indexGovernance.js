import { API_BASE, fetchJSON } from './client';

export const indexGovernanceAPI = {
  getSummary: () => fetchJSON(`${API_BASE}/index-governance/summary`),
  getAssets: () => fetchJSON(`${API_BASE}/index-governance/assets`),
  getAssetDetails: (assetKey) => fetchJSON(`${API_BASE}/index-governance/assets/${assetKey}/details`),
  getDiagnostics: () => fetchJSON(`${API_BASE}/index-governance/diagnostics`),
  scan: () => fetchJSON(`${API_BASE}/index-governance/scan`, {
    method: 'POST',
  }),
  syncStatus: () => fetchJSON(`${API_BASE}/index-governance/sync-status`, {
    method: 'POST',
  }),
  cleanupOrphans: (assetKey) => fetchJSON(`${API_BASE}/index-governance/cleanup-orphans`, {
    method: 'POST',
    body: JSON.stringify({ asset_key: assetKey, confirm: true }),
  }),
  cleanupSourceOrphans: (assetKey) => fetchJSON(`${API_BASE}/index-governance/cleanup-source-orphans`, {
    method: 'POST',
    body: JSON.stringify({ asset_key: assetKey, confirm: true }),
  }),
  rebuildQdrant: (assetKey) => fetchJSON(`${API_BASE}/index-governance/rebuild-qdrant/tasks`, {
    method: 'POST',
    body: JSON.stringify({ asset_key: assetKey, confirm: true }),
  }),
  getTasks: () => fetchJSON(`${API_BASE}/index-governance/tasks?limit=10`),
  cancelTask: (taskId) => fetchJSON(`${API_BASE}/index-governance/tasks/${taskId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  }),
  retryTask: (taskId) => fetchJSON(`${API_BASE}/index-governance/tasks/${taskId}/retry`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  }),
};
