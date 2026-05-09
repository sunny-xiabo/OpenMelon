import { API_BASE, fetchJSON, fetchBlob, fetchStream } from './client';

export const testCaseAPI = {
  generateFromFile: (file, context, requirements, module = '', use_vector = false, style_id = '', skill_ids = []) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('context', context);
    formData.append('requirements', requirements);
    formData.append('use_vector', String(use_vector));
    if (module) formData.append('module', module);
    if (style_id) formData.append('style_id', style_id);
    formData.append('skill_ids', JSON.stringify(skill_ids));
    return fetchStream(`${API_BASE}/test-cases/generate`, {
      method: 'POST',
      body: formData,
    });
  },

  generateFromContext: (context, requirements, module = '', use_vector = false, style_id = '', skill_ids = []) => {
    const formData = new FormData();
    formData.append('context', context);
    formData.append('requirements', requirements);
    formData.append('use_vector', String(use_vector));
    if (module) formData.append('module', module);
    if (style_id) formData.append('style_id', style_id);
    formData.append('skill_ids', JSON.stringify(skill_ids));
    return fetchStream(`${API_BASE}/test-cases/generate-from-context`, {
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

export const vectorAPI = {
  checkStatus: () => fetchJSON(`${API_BASE}/test-cases/vector/status`),
  storeTestCases: (testCases, module = '') => fetchJSON(`${API_BASE}/test-cases/store-vector`, {
    method: 'POST',
    body: JSON.stringify({ test_cases: testCases, module }),
  }),
};

