import { API_BASE, fetchJSON } from './client';

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

