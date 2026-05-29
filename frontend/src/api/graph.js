import { API_BASE, fetchJSON } from './client';

export const graphAPI = {
  searchEntity: (name, depth = 2) =>
    fetchJSON(`${API_BASE}/graph/entity/${encodeURIComponent(name)}?depth=${depth}`),

  getFullGraph: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`${API_BASE}/graph/full?${query}`);
  },

  getNodeDetail: (nodeId) =>
    fetchJSON(`${API_BASE}/graph/node/${nodeId}`),

  getFilters: () =>
    fetchJSON(`${API_BASE}/graph/filters`),

  getNodeTypes: () =>
    fetchJSON(`${API_BASE}/graph/node-types`),

  createNodeType: (payload) =>
    fetchJSON(`${API_BASE}/graph/node-types`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateNodeType: (nodeType, payload) =>
    fetchJSON(`${API_BASE}/graph/node-types/${encodeURIComponent(nodeType)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteNodeType: (nodeType) =>
    fetchJSON(`${API_BASE}/graph/node-types/${encodeURIComponent(nodeType)}`, {
      method: 'DELETE',
    }),

  getStatus: () =>
    fetchJSON(`${API_BASE}/graph/status`),

  getCoverage: () =>
    fetchJSON(`${API_BASE}/graph/coverage`),

  getCoverageDetail: (moduleName) =>
    fetchJSON(`${API_BASE}/graph/coverage/${encodeURIComponent(moduleName)}`),

  getPath: (source, target, maxDepth = 5) =>
    fetchJSON(`${API_BASE}/graph/path?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}&max_depth=${maxDepth}`),
};

