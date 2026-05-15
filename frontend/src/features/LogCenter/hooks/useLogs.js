import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { normalizeUnifiedLog, loadFallbackLogs } from '../components/LogCenterParts';

export const LOG_KEYS = {
  projects: ['logs', 'projects'],
  list: (params) => ['logs', 'list', params],
  summary: (params) => ['logs', 'summary', params],
  related: (id) => ['logs', 'related', id],
};

/**
 * 获取项目列表
 */
export function useLogProjects() {
  return useQuery({
    queryKey: LOG_KEYS.projects,
    queryFn: async () => {
      const data = await apiExecutionAPI.listProjects();
      return data.projects || [];
    },
  });
}

/**
 * 获取日志列表（支持 Fallback 逻辑）
 */
export function useEventLogs(params) {
  const showSnackbar = useSnackbar();

  return useQuery({
    queryKey: LOG_KEYS.list(params),
    queryFn: async () => {
      try {
        const data = await apiExecutionAPI.listEventLogs(params);
        return {
          items: (data.items || []).map(normalizeUnifiedLog),
          total: data.total || 0,
          usingFallback: false,
        };
      } catch (error) {
        // Fallback 逻辑：如果统一接口失败，回退到聚合日志模式
        const fallback = await loadFallbackLogs(params.projectId);
        showSnackbar('统一日志接口暂不可用，已切换为聚合日志模式', { severity: 'warning' });
        return {
          items: fallback.logs,
          total: fallback.logs.length,
          usingFallback: true,
          projects: fallback.projects, // fallback 模式下可能需要刷新项目列表
        };
      }
    },
    // 筛选条件变化时，自动重新获取
    keepPreviousData: true,
  });
}

/**
 * 获取日志统计摘要
 */
export function useLogSummary(params) {
  return useQuery({
    queryKey: LOG_KEYS.summary(params),
    queryFn: () => apiExecutionAPI.getEventLogSummary(params),
    enabled: !!params,
  });
}

/**
 * 获取关联日志
 */
export function useRelatedLogs(logId) {
  return useQuery({
    queryKey: LOG_KEYS.related(logId),
    queryFn: async () => {
      if (!logId) return [];
      const data = await apiExecutionAPI.listRelatedEventLogs(logId, { limit: 8 });
      return (data.items || []).map(normalizeUnifiedLog);
    },
    enabled: !!logId,
  });
}

/**
 * 清理日志
 */
export function useCleanupLogs() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: (params) => apiExecutionAPI.deleteEventLogs(params),
    onSuccess: (data) => {
      // 刷新列表和统计
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      
      if (data.deleted) {
        showSnackbar(`已清理 ${data.deleted || 0} 条日志，剩余 ${data.remaining || 0} 条`, { severity: 'success' });
      } else {
        showSnackbar('未发现符合条件的日志，未删除任何记录', { severity: 'info' });
      }
    },
    onError: (error) => {
      showSnackbar(error.message || '清理日志失败', { severity: 'error' });
    },
  });
}
