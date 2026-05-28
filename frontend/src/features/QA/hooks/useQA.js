import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatAPI, graphAPI } from '../../../services/api';
import { useSnackbar } from '../../../components/SnackbarProvider';

export const QA_KEYS = {
  sessions: ['qa', 'sessions'],
  history: (sid) => ['qa', 'history', sid],
  graphStatus: ['qa', 'graph-status'],
  feedbacks: (sid) => ['qa', 'feedbacks', sid],
};

/**
 * 获取所有会话列表
 */
export function useSessions() {
  return useQuery({
    queryKey: QA_KEYS.sessions,
    queryFn: async () => {
      const data = await chatAPI.getSessions();
      return data.sessions || [];
    },
  });
}

/**
 * 获取会话历史
 */
export function useChatHistory(sessionId) {
  return useQuery({
    queryKey: QA_KEYS.history(sessionId),
    queryFn: async () => {
      if (!sessionId) return [];
      const data = await chatAPI.getHistory(sessionId);
      return data.history || [];
    },
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000, // 历史消息可以缓存久一点
  });
}

/**
 * 获取图谱状态
 */
export function useGraphStatus() {
  return useQuery({
    queryKey: QA_KEYS.graphStatus,
    queryFn: () => graphAPI.getStatus(),
    refetchInterval: 30000, // 每 30 秒轮询一次图谱状态
  });
}

/**
 * 获取消息反馈状态
 */
export function useFeedbacks(sessionId) {
  return useQuery({
    queryKey: QA_KEYS.feedbacks(sessionId),
    queryFn: () => chatAPI.getFeedback(sessionId),
    enabled: !!sessionId,
  });
}

/**
 * 发送问答查询
 */
export function useChatQuery() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: ({ question, sessionId, includeHistory }) => 
      chatAPI.query(question, sessionId, includeHistory),
    onSuccess: (_, variables) => {
      // 使当前历史记录失效
      queryClient.invalidateQueries({ queryKey: QA_KEYS.history(variables.sessionId) });
      // 同时刷新会话列表，因为最新消息可能改变了会话的 title 或 updated_at
      queryClient.invalidateQueries({ queryKey: QA_KEYS.sessions });
    },
    onError: (err) => {
      showSnackbar('查询失败: ' + err.message, { severity: 'error' });
    }
  });
}

/**
 * 会话操作 Mutations
 */
export function useSessionActions() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  const deleteSession = useMutation({
    mutationFn: (sid) => chatAPI.deleteSession(sid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QA_KEYS.sessions });
      showSnackbar('会话已删除', { severity: 'success' });
    }
  });

  const renameSession = useMutation({
    mutationFn: ({ sid, title }) => chatAPI.renameSession(sid, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QA_KEYS.sessions });
    }
  });

  return { deleteSession, renameSession };
}
