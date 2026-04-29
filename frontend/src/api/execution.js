import { API_BASE, fetchJSON, fetchJSONWithTimeout, fetchBlob, OPENAPI_PARSE_TIMEOUT_MS } from './client';

export const apiExecutionAPI = {
  listProjects: () =>
    fetchJSON(`${API_BASE}/api-execution/projects`),

  listPolicyAudits: ({ limit = 20, projectId = '', action = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (projectId) params.set('project_id', projectId);
    if (action) params.set('action', action);
    return fetchJSON(`${API_BASE}/api-execution/policy/audits?${params.toString()}`);
  },

  listAutomationTasks: ({ limit = 20, status = '', projectId = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/automation/tasks?${params.toString()}`);
  },

  resolveAutomationTask: (taskId) =>
    fetchJSON(`${API_BASE}/api-execution/automation/tasks/${encodeURIComponent(taskId)}/resolve`, {
      method: 'POST',
    }),

  triggerScheduledRuns: () =>
    fetchJSON(`${API_BASE}/api-execution/automation/scheduled-runs/trigger`, {
      method: 'POST',
    }),

  triggerSpecSync: () =>
    fetchJSON(`${API_BASE}/api-execution/automation/spec-sync/trigger`, {
      method: 'POST',
    }),

  ingestRunKnowledge: (limit = 20) =>
    fetchJSON(`${API_BASE}/api-execution/knowledge/ingest-runs?limit=${encodeURIComponent(limit)}`, {
      method: 'POST',
    }),

  searchRepairKnowledge: ({ query = '', projectId = '', limit = 5 } = {}) => {
    const params = new URLSearchParams({ query, limit: String(limit) });
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/knowledge/search-repairs?${params.toString()}`);
  },

  approveKnowledgeCandidate: (taskId) =>
    fetchJSON(`${API_BASE}/api-execution/knowledge/candidates/${encodeURIComponent(taskId)}/approve`, {
      method: 'POST',
    }),

  saveProject: (project) =>
    fetchJSON(`${API_BASE}/api-execution/projects`, {
      method: 'POST',
      body: JSON.stringify(project),
    }),

  getProject: (projectId) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}`),

  deleteProject: (projectId) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),

  listEnvironments: (projectId) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/environments`),

  saveEnvironment: (projectId, environment) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/environments`, {
      method: 'POST',
      body: JSON.stringify(environment),
    }),

  updateEnvironment: (environmentId, environment) =>
    fetchJSON(`${API_BASE}/api-execution/environments/${encodeURIComponent(environmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(environment),
    }),

  deleteEnvironment: (environmentId) =>
    fetchJSON(`${API_BASE}/api-execution/environments/${encodeURIComponent(environmentId)}`, {
      method: 'DELETE',
    }),

  parseOpenApiFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchJSONWithTimeout(`${API_BASE}/api-execution/openapi/parse-file`, {
      method: 'POST',
      body: formData,
    }, OPENAPI_PARSE_TIMEOUT_MS);
  },

  parseOpenApiUrl: (url, forceRefresh = false) =>
    fetchJSONWithTimeout(`${API_BASE}/api-execution/openapi/parse-url`, {
      method: 'POST',
      body: JSON.stringify({ url, force_refresh: forceRefresh }),
    }, OPENAPI_PARSE_TIMEOUT_MS),

  getOperations: (specId) =>
    fetchJSON(`${API_BASE}/api-execution/specs/${encodeURIComponent(specId)}/operations`),

  generateDsl: (specId, operationIds) =>
    fetchJSON(`${API_BASE}/api-execution/dsl/generate`, {
      method: 'POST',
      body: JSON.stringify({ spec_id: specId, operation_ids: operationIds }),
    }),

  validateDsl: (script) =>
    fetchJSON(`${API_BASE}/api-execution/dsl/validate`, {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),

  enhanceDsl: (script, projectPolicySnapshot = {}) =>
    fetchJSON(`${API_BASE}/api-execution/ai/dsl/enhance`, {
      method: 'POST',
      body: JSON.stringify({ script, project_policy_snapshot: projectPolicySnapshot }),
    }),

  generateRepairPatch: (script, report, projectPolicySnapshot = {}) =>
    fetchJSON(`${API_BASE}/api-execution/ai/repair-patch`, {
      method: 'POST',
      body: JSON.stringify({ script, report, project_policy_snapshot: projectPolicySnapshot }),
    }),

  autoRepairRun: (runId) =>
    fetchJSONWithTimeout(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}/auto-repair`, {
      method: 'POST',
    }, 30000),

  runSingleStep: (script, options = {}) =>
    fetchJSON(`${API_BASE}/api-execution/runs/single-step`, {
      method: 'POST',
      body: JSON.stringify({ script, ...options }),
    }),

  runAllSteps: (script, options = {}) => {
    const { requestTimeoutMs = 90000, ...runOptions } = options;
    return fetchJSONWithTimeout(`${API_BASE}/api-execution/runs`, {
      method: 'POST',
      body: JSON.stringify({ script, ...runOptions }),
    }, requestTimeoutMs);
  },

  createBackgroundRun: (script, options = {}) =>
    fetchJSON(`${API_BASE}/api-execution/runs/async`, {
      method: 'POST',
      body: JSON.stringify({ script, ...options }),
    }),

  getRun: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}`),

  listCaseRuns: (caseId, limit = 10) =>
    fetchJSON(`${API_BASE}/api-execution/cases/${encodeURIComponent(caseId)}/runs?limit=${limit}`),

  cancelRun: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    }),

  listRuns: ({ limit = 10, status = '', keyword = '', projectId = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    if (keyword) params.set('keyword', keyword);
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/runs?${params.toString()}`);
  },

  deleteRun: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}`, {
      method: 'DELETE',
    }),

  exportPytest: (script) =>
    fetchBlob(`${API_BASE}/api-execution/export/pytest`, {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),

  exportPostman: (script) =>
    fetchBlob(`${API_BASE}/api-execution/export/postman`, {
      method: 'POST',
      body: JSON.stringify({ script }),
    }),
};

