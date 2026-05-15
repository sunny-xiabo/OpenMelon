import { useQuery } from '@tanstack/react-query';
import { graphAPI, apiExecutionAPI } from '../../../services/api';

export const DASHBOARD_KEYS = {
  coverage: ['dashboard', 'coverage'],
  apiSummary: (projectId) => ['dashboard', 'api-summary', { projectId }],
};

/**
 * 获取覆盖率数据
 */
export function useCoverage() {
  return useQuery({
    queryKey: DASHBOARD_KEYS.coverage,
    queryFn: async () => {
      const data = await graphAPI.getCoverage();
      return (data.modules || []).sort((a, b) => b.coverage_percentage - a.coverage_percentage);
    },
    staleTime: 5 * 60 * 1000, // 覆盖率数据不常变，缓存 5 分钟
  });
}

/**
 * 获取 API 执行概览统计
 */
export function useAPIExecSummary(projectId) {
  return useQuery({
    queryKey: DASHBOARD_KEYS.apiSummary(projectId),
    queryFn: () => apiExecutionAPI.getDashboardSummary({ projectId, limit: 50 }),
    // refetchOnWindowFocus: true, // 仪表盘建议在切回窗口时刷新
  });
}
