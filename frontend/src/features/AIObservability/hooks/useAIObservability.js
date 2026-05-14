import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiExecutionAPI } from '../../../api/execution';
import { useSnackbar } from '../../../components/SnackbarProvider';

export const AI_OBS_KEYS = {
  summary: (params) => ['ai-obs', 'summary', params],
  logs: (params) => ['ai-obs', 'logs', params],
  settings: ['ai-obs', 'settings'],
  snapshot: (id) => ['ai-obs', 'snapshot', id],
};

/**
 * 获取 AI 调用统计摘要
 */
export function useAISummary(params) {
  return useQuery({
    queryKey: AI_OBS_KEYS.summary(params),
    queryFn: () => apiExecutionAPI.getAICallSummary(params),
    staleTime: 60 * 1000, // 看板数据缓存 1 分钟
  });
}

/**
 * 获取 AI 调用明细日志
 */
export function useAILogs(params) {
  return useQuery({
    queryKey: AI_OBS_KEYS.logs(params),
    queryFn: () => apiExecutionAPI.listAICallLogs(params),
    keepPreviousData: true,
  });
}

/**
 * 获取调试快照设置
 */
export function useAIDebugSettings() {
  return useQuery({
    queryKey: AI_OBS_KEYS.settings,
    queryFn: () => apiExecutionAPI.getAIDebugSettings(),
  });
}

/**
 * 更新调试快照设置
 */
export function useUpdateDebugSettings() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: (settings) => apiExecutionAPI.updateAIDebugSettings(settings),
    onSuccess: (data) => {
      queryClient.setQueryData(AI_OBS_KEYS.settings, data);
      showSnackbar(data.enabled ? 'AI/RAG 调试快照已开启' : 'AI/RAG 调试快照已关闭', {
        severity: data.enabled ? 'warning' : 'success'
      });
    },
    onError: (error) => {
      showSnackbar(error.message || '更新调试设置失败', { severity: 'error' });
    }
  });
}

/**
 * 获取调试快照详情
 */
export function useAIDebugSnapshot() {
  return useMutation({
    mutationFn: (callId) => apiExecutionAPI.getAIDebugSnapshot(callId),
  });
}
