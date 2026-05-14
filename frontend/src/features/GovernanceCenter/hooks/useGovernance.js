import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';

export const GOV_KEYS = {
  projects: ['gov', 'projects'],
  taskSummary: (projectId) => ['gov', 'tasks', 'summary', projectId],
  tasks: (projectId, status) => ['gov', 'tasks', 'list', projectId, status],
  knowledge: (params) => ['gov', 'knowledge', 'list', params],
  knowledgeAll: (projectId) => ['gov', 'knowledge', 'all', projectId],
  templates: (projectId) => ['gov', 'templates', 'list', projectId],
};

/**
 * 获取项目列表
 */
export function useGovernanceProjects() {
  return useQuery({
    queryKey: GOV_KEYS.projects,
    queryFn: async () => {
      const data = await apiExecutionAPI.listProjects();
      return data.projects || [];
    },
  });
}

/**
 * 获取任务中心摘要
 */
export function useTaskSummary(projectId) {
  return useQuery({
    queryKey: GOV_KEYS.taskSummary(projectId),
    queryFn: () => apiExecutionAPI.getTaskCenterSummary({ projectId, limit: 50 }),
  });
}

/**
 * 获取待办任务列表
 */
export function useAutomationTasks(projectId, status) {
  return useQuery({
    queryKey: GOV_KEYS.tasks(projectId, status),
    queryFn: async () => {
      const data = await apiExecutionAPI.listAutomationTasks({ projectId, status, limit: 100 });
      return data.items || data.tasks || [];
    },
  });
}

/**
 * 获取知识库条目
 */
export function useKnowledgeItems(params) {
  return useQuery({
    queryKey: GOV_KEYS.knowledge(params),
    queryFn: async () => {
      const data = await apiExecutionAPI.listKnowledgeReviewItems({ ...params, limit: 100 });
      return data.items || [];
    },
  });
}

/**
 * 获取所有知识项（用于计算类型筛选项和资产健康）
 */
export function useAllKnowledgeItems(projectId) {
  return useQuery({
    queryKey: GOV_KEYS.knowledgeAll(projectId),
    queryFn: async () => {
      const data = await apiExecutionAPI.listKnowledgeReviewItems({ projectId, limit: 500 });
      return data.items || [];
    },
    select: (items) => ({
      items,
      typeOptions: [...new Set(items.map((item) => item.item_type).filter(Boolean))].sort(),
    }),
  });
}

/**
 * 获取流程模板列表
 */
export function useFlowTemplates(projectId) {
  return useQuery({
    queryKey: GOV_KEYS.templates(projectId),
    queryFn: async () => {
      const data = await apiExecutionAPI.listFlowTemplates({ projectId, limit: 100 });
      return data.items || data.templates || [];
    },
  });
}

/**
 * 通用治理操作 Mutation 封装
 */
function useGovernanceMutation(mutationFn, successMessage) {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gov'] });
      if (successMessage) {
        const msg = typeof successMessage === 'function' ? successMessage(data) : successMessage;
        showSnackbar(msg, { severity: data?.errors?.length ? 'warning' : 'success' });
      }
    },
    onError: (error) => {
      showSnackbar(error.message || '操作失败', { severity: 'error' });
    },
  });
}

export function useApproveCandidate() {
  return useGovernanceMutation(
    (taskId) => apiExecutionAPI.approveKnowledgeCandidate(taskId),
    (data) => `已确认沉淀：${data.knowledge_count} 条知识，向量写入 ${data.vector_written || 0}`
  );
}

export function useResolveTask() {
  return useGovernanceMutation(
    (taskId) => apiExecutionAPI.resolveAutomationTask(taskId),
    '待处理项已标记完成'
  );
}

export function useUpdateKnowledgeStatus() {
  return useGovernanceMutation(
    ({ id, status }) => apiExecutionAPI.updateKnowledgeStatus(id, { status }),
    ({ status }) => status === 'active' ? '知识项已恢复有效' : status === 'invalid' ? '知识项已标记失效' : '知识项已撤回'
  );
}

export function useDeleteKnowledgeItem() {
  return useGovernanceMutation(
    (id) => apiExecutionAPI.deleteKnowledgeItem(id),
    '知识项已永久删除'
  );
}

export function useDeleteTemplate() {
  return useGovernanceMutation(
    (id) => apiExecutionAPI.deleteFlowTemplate(id),
    '流程模板已删除'
  );
}
