import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';

export const EXEC_KEYS = {
  projects: ['exec', 'projects'],
  assets: (projectId) => ['exec', 'assets', projectId],
  environments: (projectId) => ['exec', 'environments', projectId],
  flowTemplates: (projectId) => ['exec', 'flow-templates', projectId],
  history: (params) => ['exec', 'history', params],
  tasks: (projectId) => ['exec', 'tasks', 'pending', projectId],
};

/**
 * 获取所有项目列表
 */
export function useExecProjects() {
  return useQuery({
    queryKey: EXEC_KEYS.projects,
    queryFn: async () => {
      const data = await apiExecutionAPI.listProjects();
      return data.projects || [];
    },
  });
}

/**
 * 获取指定项目的环境列表
 */
export function useExecEnvironments(projectId) {
  return useQuery({
    queryKey: EXEC_KEYS.environments(projectId),
    queryFn: async () => {
      if (!projectId) return [];
      const data = await apiExecutionAPI.listEnvironments(projectId);
      return data.environments || [];
    },
    enabled: !!projectId,
  });
}

/**
 * 获取项目 API 资产台账
 */
export function useProjectAssets(projectId) {
  return useQuery({
    queryKey: EXEC_KEYS.assets(projectId),
    queryFn: async () => {
      if (!projectId) return null;
      return apiExecutionAPI.getProjectAssets(projectId);
    },
    enabled: !!projectId,
  });
}

/**
 * 获取项目测试任务/流程模板
 */
export function useFlowTemplates(projectId) {
  return useQuery({
    queryKey: EXEC_KEYS.flowTemplates(projectId || ''),
    queryFn: async () => {
      const data = await apiExecutionAPI.listFlowTemplates({ projectId: projectId || '', limit: 100 });
      return data.items || data.templates || [];
    },
    enabled: !!projectId,
  });
}

/**
 * 获取执行历史记录
 */
export function useExecHistory(params) {
  return useQuery({
    queryKey: EXEC_KEYS.history(params),
    queryFn: async () => {
      const data = await apiExecutionAPI.listRuns({
        limit: 10,
        ...params,
        keyword: params.keyword?.trim(),
      });
      return data.items || data.runs || [];
    },
    keepPreviousData: true,
  });
}

/**
 * 获取待办自动化任务
 */
export function usePendingTasks(projectId) {
  return useQuery({
    queryKey: EXEC_KEYS.tasks(projectId),
    queryFn: async () => {
      const data = await apiExecutionAPI.listAutomationTasks({
        limit: 10,
        status: 'pending',
        projectId,
      });
      return data.items || data.tasks || [];
    },
  });
}

/**
 * 基础 Mutation 封装
 */
function useExecMutation(mutationFn, successMessage, invalidateKeys = []) {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      if (successMessage) {
        const msg = typeof successMessage === 'function' ? successMessage(data) : successMessage;
        showSnackbar(msg, { severity: 'success' });
      }
    },
    onError: (error) => {
      showSnackbar(error.message || '操作失败', { severity: 'error' });
    },
  });
}

// 项目操作
export function useSaveProjectMutation() {
  return useExecMutation(
    (project) => apiExecutionAPI.saveProject(project),
    '项目已保存',
    [EXEC_KEYS.projects]
  );
}

export function useDeleteProjectMutation() {
  return useExecMutation(
    (projectId) => apiExecutionAPI.deleteProject(projectId),
    '项目已删除',
    [EXEC_KEYS.projects]
  );
}

// 环境操作
export function useSaveEnvironmentMutation(projectId) {
  return useExecMutation(
    ({ envId, payload }) => envId 
      ? apiExecutionAPI.updateEnvironment(envId, payload)
      : apiExecutionAPI.saveEnvironment(projectId, payload),
    '环境已保存',
    [EXEC_KEYS.environments(projectId)]
  );
}

export function useDeleteEnvironmentMutation(projectId) {
  return useExecMutation(
    (envId) => apiExecutionAPI.deleteEnvironment(envId),
    '环境已删除',
    [EXEC_KEYS.environments(projectId)]
  );
}

// 执行记录操作
export function useDeleteRunMutation() {
  return useExecMutation(
    (runId) => apiExecutionAPI.deleteRun(runId),
    '记录已删除',
    [['exec', 'history']]
  );
}

export function useBatchDeleteRunsMutation() {
  return useExecMutation(
    (runIds) => apiExecutionAPI.batchDeleteRuns(runIds),
    (res) => `已成功删除 ${res.deleted_count} 条执行记录`,
    [['exec', 'history']]
  );
}

// OpenAPI 解析操作
export function useParseSpecMutation() {
  const showSnackbar = useSnackbar();
  return useMutation({
    mutationFn: ({ type, payload }) => {
      if (type === 'file') return apiExecutionAPI.parseOpenApiFile(payload);
      if (type === 'url') return apiExecutionAPI.parseOpenApiUrl(payload.url, payload.forceRefresh);
      if (type === 'demo') return apiExecutionAPI.loadDemoOpenApi();
      throw new Error('不支持的解析类型');
    },
    onSuccess: (data) => {
      showSnackbar(`解析成功，共 ${data.operation_count || 0} 个接口`, { severity: 'success' });
    },
    onError: (error) => {
      showSnackbar(error.message || 'API 解析失败', { severity: 'error' });
    }
  });
}
