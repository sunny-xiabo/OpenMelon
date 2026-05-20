import { API_BASE, fetchJSON, fetchJSONWithTimeout, fetchBlob, OPENAPI_PARSE_TIMEOUT_MS } from './client';

export const apiExecutionAPI = {
  listProjects: () =>
    fetchJSON(`${API_BASE}/api-execution/projects`),

  getProjectAssets: (projectId) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/assets`),

  previewProjectAssets: (projectId, specId = '') => {
    const params = new URLSearchParams();
    if (specId) params.set('spec_id', specId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/assets/preview${suffix}`);
  },

  syncProjectAssets: (projectId, specId = '') => {
    const params = new URLSearchParams();
    if (specId) params.set('spec_id', specId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/assets/sync${suffix}`, {
      method: 'POST',
    });
  },

  buildAssetTestPlan: (projectId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/assets/test-plan`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAssetImpact: (projectId, specId = '') => {
    const params = new URLSearchParams();
    if (specId) params.set('spec_id', specId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/assets/impact${suffix}`);
  },

  getAgentContext: (projectId) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/agent/context`),

  buildAgentTestPlan: (projectId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/agent/test-plan`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listProjectModules: (projectId) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/modules`),

  createProjectModule: (projectId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/modules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProjectModule: (moduleId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/modules/${encodeURIComponent(moduleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  removeProjectModule: (moduleId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/modules/${encodeURIComponent(moduleId)}/remove`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  mergeProjectModule: (moduleId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/modules/${encodeURIComponent(moduleId)}/merge`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteProjectModule: (moduleId) =>
    fetchJSON(`${API_BASE}/api-execution/modules/${encodeURIComponent(moduleId)}`, {
      method: 'DELETE',
    }),

  listProjectInterfaces: ({ projectId, moduleId = '', status = '', riskLevel = '', keyword = '', limit = 500, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (moduleId) params.set('module_id', moduleId);
    if (status) params.set('status', status);
    if (riskLevel) params.set('risk_level', riskLevel);
    if (keyword) params.set('keyword', keyword);
    return fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/interfaces?${params.toString()}`);
  },

  createProjectInterface: (projectId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/projects/${encodeURIComponent(projectId)}/interfaces`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProjectInterface: (interfaceId, payload) =>
    fetchJSON(`${API_BASE}/api-execution/interfaces/${encodeURIComponent(interfaceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteProjectInterface: (interfaceId) =>
    fetchJSON(`${API_BASE}/api-execution/interfaces/${encodeURIComponent(interfaceId)}`, {
      method: 'DELETE',
    }),

  getDashboardSummary: ({ projectId = '', limit = 50 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/dashboard/summary?${params.toString()}`);
  },

  listFlowTemplates: ({ projectId = '', limit = 100, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/flow-templates?${params.toString()}`);
  },

  saveFlowTemplate: (template) =>
    fetchJSON(`${API_BASE}/api-execution/flow-templates`, {
      method: 'POST',
      body: JSON.stringify(template),
    }),

  deleteFlowTemplate: (templateId) =>
    fetchJSON(`${API_BASE}/api-execution/flow-templates/${encodeURIComponent(templateId)}`, {
      method: 'DELETE',
    }),

  listPolicyAudits: ({ limit = 20, offset = 0, projectId = '', action = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (projectId) params.set('project_id', projectId);
    if (action) params.set('action', action);
    return fetchJSON(`${API_BASE}/api-execution/policy/audits?${params.toString()}`);
  },

  listEventLogs: ({
    limit = 50,
    offset = 0,
    projectId = '',
    module = '',
    level = '',
    eventType = '',
    traceId = '',
    keyword = '',
    startAt = '',
    endAt = '',
  } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (projectId) params.set('project_id', projectId);
    if (module) params.set('module', module);
    if (level) params.set('level', level);
    if (eventType) params.set('event_type', eventType);
    if (traceId) params.set('trace_id', traceId);
    if (keyword) params.set('keyword', keyword);
    if (startAt) params.set('start_at', startAt);
    if (endAt) params.set('end_at', endAt);
    return fetchJSON(`${API_BASE}/logs/events?${params.toString()}`);
  },

  getEventLogSummary: ({ projectId = '', module = '', level = '', eventType = '', traceId = '', keyword = '', startAt = '', endAt = '' } = {}) => {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    if (module) params.set('module', module);
    if (level) params.set('level', level);
    if (eventType) params.set('event_type', eventType);
    if (traceId) params.set('trace_id', traceId);
    if (keyword) params.set('keyword', keyword);
    if (startAt) params.set('start_at', startAt);
    if (endAt) params.set('end_at', endAt);
    return fetchJSON(`${API_BASE}/logs/summary?${params.toString()}`);
  },

  listRelatedEventLogs: (eventId, { limit = 20 } = {}) =>
    fetchJSON(`${API_BASE}/logs/events/${encodeURIComponent(eventId)}/related?limit=${encodeURIComponent(limit)}`),

  listAICallLogs: ({
    limit = 50,
    offset = 0,
    feature = '',
    operation = '',
    model = '',
    status = '',
    degraded = '',
    keyword = '',
    startAt = '',
    endAt = '',
  } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (feature) params.set('feature', feature);
    if (operation) params.set('operation', operation);
    if (model) params.set('model', model);
    if (status) params.set('status', status);
    if (degraded !== '') params.set('degraded', String(degraded));
    if (keyword) params.set('keyword', keyword);
    if (startAt) params.set('start_at', startAt);
    if (endAt) params.set('end_at', endAt);
    return fetchJSON(`${API_BASE}/logs/ai-calls?${params.toString()}`);
  },

  getAICallSummary: ({ feature = '', operation = '', model = '', status = '', degraded = '', keyword = '', startAt = '', endAt = '' } = {}) => {
    const params = new URLSearchParams();
    if (feature) params.set('feature', feature);
    if (operation) params.set('operation', operation);
    if (model) params.set('model', model);
    if (status) params.set('status', status);
    if (degraded !== '') params.set('degraded', String(degraded));
    if (keyword) params.set('keyword', keyword);
    if (startAt) params.set('start_at', startAt);
    if (endAt) params.set('end_at', endAt);
    return fetchJSON(`${API_BASE}/logs/ai-calls/summary?${params.toString()}`);
  },

  getAIDebugSettings: () =>
    fetchJSON(`${API_BASE}/logs/ai-debug/settings`),

  updateAIDebugSettings: (settings) =>
    fetchJSON(`${API_BASE}/logs/ai-debug/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  getAIDebugSnapshot: (callId) =>
    fetchJSON(`${API_BASE}/logs/ai-calls/${encodeURIComponent(callId)}/debug-snapshot`),

  deleteEventLogs: async ({ olderThanDays = 90, level = 'non_error', projectId = '', module = '' } = {}) => {
    const cleanupOneLevel = async (cleanupLevel) => {
      try {
        return await fetchJSON(`${API_BASE}/logs/events/cleanup`, {
          method: 'POST',
          body: JSON.stringify({
            older_than_days: olderThanDays,
            level: cleanupLevel,
            project_id: projectId,
            module,
          }),
        });
      } catch (error) {
        const params = new URLSearchParams({ older_than_days: String(olderThanDays), level: cleanupLevel });
        if (projectId) params.set('project_id', projectId);
        if (module) params.set('module', module);
        return fetchJSON(`${API_BASE}/logs/events?${params.toString()}`, {
          method: 'DELETE',
        });
      }
    };
    if (level === 'all') {
      const results = await Promise.all(['info', 'warning', 'error'].map((cleanupLevel) => cleanupOneLevel(cleanupLevel)));
      return {
        deleted: results.reduce((sum, item) => sum + (item.deleted || 0), 0),
        remaining: results.at(-1)?.remaining || 0,
        older_than: results.at(-1)?.older_than || '',
        level: 'all',
      };
    }
    return cleanupOneLevel(level);
  },

  listAutomationTasks: ({ limit = 20, offset = 0, status = '', projectId = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set('status', status);
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/automation/tasks?${params.toString()}`);
  },

  getTaskCenterSummary: ({ limit = 50, projectId = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/automation/task-center/summary?${params.toString()}`);
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

  getStorageMigrationReadiness: () =>
    fetchJSON(`${API_BASE}/api-execution/storage/migration-readiness`),

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

  createKnowledgeCandidate: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/knowledge/runs/${encodeURIComponent(runId)}/candidate`, {
      method: 'POST',
    }),

  listKnowledgeReviewItems: ({ limit = 50, offset = 0, projectId = '', status = '', itemType = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (projectId) params.set('project_id', projectId);
    if (status) params.set('status', status);
    if (itemType) params.set('item_type', itemType);
    return fetchJSON(`${API_BASE}/api-execution/knowledge/review?${params.toString()}`);
  },

  updateKnowledgeStatus: (knowledgeId, { status, note = '' }) =>
    fetchJSON(`${API_BASE}/api-execution/knowledge/items/${encodeURIComponent(knowledgeId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  deleteKnowledgeItem: (knowledgeId) =>
    fetchJSON(`${API_BASE}/api-execution/knowledge/items/${encodeURIComponent(knowledgeId)}`, {
      method: 'DELETE',
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

  loadDemoOpenApi: () =>
    fetchJSON(`${API_BASE}/api-execution/demo/openapi`),

  bootstrapDemoProject: () =>
    fetchJSON(`${API_BASE}/api-execution/demo/bootstrap`, {
      method: 'POST',
    }),

  getOperations: (specId) =>
    fetchJSON(`${API_BASE}/api-execution/specs/${encodeURIComponent(specId)}/operations`),

  getSpec: (specId) =>
    fetchJSON(`${API_BASE}/api-execution/specs/${encodeURIComponent(specId)}`),

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

  generateFlowDraft: ({
    specId,
    businessGoal,
    operationIds = [],
    projectName = '',
    environmentName = '',
    baseUrl = '',
    projectPolicySnapshot = {},
  }) =>
    fetchJSON(`${API_BASE}/api-execution/ai/flow-draft`, {
      method: 'POST',
      body: JSON.stringify({
        spec_id: specId,
        business_goal: businessGoal,
        operation_ids: operationIds,
        project_name: projectName,
        environment_name: environmentName,
        base_url: baseUrl,
        project_policy_snapshot: projectPolicySnapshot,
      }),
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

  getRunProgressStreamUrl: (runId) =>
    `${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}/stream`,

  getRun: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}`),

  listCaseRuns: (caseId, limit = 10, offset = 0) =>
    fetchJSON(`${API_BASE}/api-execution/cases/${encodeURIComponent(caseId)}/runs?limit=${limit}&offset=${offset}`),

  cancelRun: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    }),

  listRuns: ({ limit = 10, offset = 0, status = '', keyword = '', projectId = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set('status', status);
    if (keyword) params.set('keyword', keyword);
    if (projectId) params.set('project_id', projectId);
    return fetchJSON(`${API_BASE}/api-execution/runs?${params.toString()}`);
  },

  deleteRun: (runId) =>
    fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}`, {
      method: 'DELETE',
    }),

  batchDeleteRuns: (runIds) =>
    fetchJSON(`${API_BASE}/api-execution/runs/batch-delete`, {
      method: 'POST',
      body: JSON.stringify(runIds),
    }),

  clearAllRuns: () =>
    fetchJSON(`${API_BASE}/api-execution/runs/clear-all`, {
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
