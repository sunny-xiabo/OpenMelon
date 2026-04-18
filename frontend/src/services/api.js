const rawApiBase = import.meta.env.VITE_API_BASE_URL || '/api';
const API_BASE = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase;

const fetchJSON = async (url, options = {}) => {
  const headers = { ...options.headers };
  if (typeof options.body === 'string') {
    headers['Content-Type'] = 'Content-Type' in headers ? headers['Content-Type'] : 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(err.detail || `API Error: ${response.status}`);
  }
  return response.json();
};

const fetchBlob = async (url, options = {}) => {
  const headers = { ...options.headers };
  if (typeof options.body === 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(err.detail || `API Error: ${response.status}`);
  }
  return response.blob();
};

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
};

export const fileAPI = {
  list: () => fetchJSON(`${API_BASE}/manage/files`),

  delete: (recordId) =>
    fetchJSON(`${API_BASE}/manage/files/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
    }),

  reindex: (recordId) =>
    fetchJSON(`${API_BASE}/manage/files/${encodeURIComponent(recordId)}/reindex`, {
      method: 'POST',
    }),
};

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
};

export const uploadAPI = {
  uploadAsync: (files, docType = '', module = '') => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    if (docType) formData.append('doc_type', docType);
    if (module) formData.append('module', module);
    return fetchJSON(`${API_BASE}/upload/async`, {
      method: 'POST',
      body: formData,
    });
  },

  getStatus: (taskId) =>
    fetchJSON(`${API_BASE}/upload/status/${encodeURIComponent(taskId)}`),

  getFormats: () =>
    fetchJSON(`${API_BASE}/upload/formats`),
};

export const testCaseAPI = {
  generateFromFile: (file, context, requirements, module = '', use_vector = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('context', context);
    formData.append('requirements', requirements);
    formData.append('use_vector', String(use_vector));
    if (module) formData.append('module', module);
    return fetch(`${API_BASE}/test-cases/generate`, {
      method: 'POST',
      body: formData,
    });
  },

  generateFromContext: (context, requirements, module = '', use_vector = false) => {
    const formData = new FormData();
    formData.append('context', context);
    formData.append('requirements', requirements);
    formData.append('use_vector', String(use_vector));
    if (module) formData.append('module', module);
    return fetch(`${API_BASE}/test-cases/generate-from-context`, {
      method: 'POST',
      body: formData,
    });
  },

  generateMindmap: (testCases) =>
    fetchJSON(`${API_BASE}/test-cases/generate-mindmap`, {
      method: 'POST',
      body: JSON.stringify({ test_cases: testCases }),
    }),

  exportToExcel: (testCases) =>
    fetchBlob(`${API_BASE}/test-cases/export`, {
      method: 'POST',
      body: JSON.stringify(testCases),
    }),

  exportMarkdown: (markdown) =>
    fetchBlob(`${API_BASE}/test-cases/export-markdown`, {
      method: 'POST',
      body: JSON.stringify({ markdown }),
    }),

  exportXMind: (testCases) =>
    fetchBlob(`${API_BASE}/test-cases/export-xmind-json`, {
      method: 'POST',
      body: JSON.stringify(testCases),
    }),

  downloadExcel: (filename) =>
    fetchBlob(`${API_BASE}/test-cases/download/${encodeURIComponent(filename)}`),
};

export const logsAPI = {
  list: () => fetchJSON(`${API_BASE}/logs/list`),
  get: (filename = 'graph_rag.log', lines = 100) =>
    fetchJSON(`${API_BASE}/logs?filename=${filename}&lines=${lines}`),
};

export const vectorAPI = {
  checkStatus: () => fetchJSON(`${API_BASE}/test-cases/vector/status`),
  storeTestCases: (testCases, module = '') => fetchJSON(`${API_BASE}/test-cases/store-vector`, {
    method: 'POST',
    body: JSON.stringify({ test_cases: testCases, module }),
  }),
};

export const webhookAPI = {
  send: (platform, question, answer) =>
    fetchJSON(`${API_BASE}/webhook/${platform}`, {
      method: 'POST',
      body: JSON.stringify({ question, answer }),
    }),
};
