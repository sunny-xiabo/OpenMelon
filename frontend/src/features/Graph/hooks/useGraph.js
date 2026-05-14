import { useQuery, useMutation } from '@tanstack/react-query';
import { graphAPI } from '../../../services/api';

export const GRAPH_KEYS = {
  status: ['graph', 'status'],
  filters: ['graph', 'filters'],
  full: (params) => ['graph', 'full', params],
  detail: (id) => ['graph', 'detail', id],
  search: (keyword) => ['graph', 'search', keyword],
};

/**
 * 获取图谱状态
 */
export function useGraphStatus() {
  return useQuery({
    queryKey: GRAPH_KEYS.status,
    queryFn: () => graphAPI.getStatus(),
    refetchInterval: 30000, // 每 30 秒轮询
  });
}

/**
 * 获取图谱过滤选项
 */
export function useGraphFilters() {
  return useQuery({
    queryKey: GRAPH_KEYS.filters,
    queryFn: () => graphAPI.getFilters(),
  });
}

/**
 * 获取全量图谱数据
 */
export function useFullGraph(params, enabled = true) {
  return useQuery({
    queryKey: GRAPH_KEYS.full(params),
    queryFn: () => graphAPI.getFullGraph(params),
    enabled: enabled && !!params,
    staleTime: 60 * 1000,
  });
}

/**
 * 获取节点详情 (作为 Mutation 使用，因为是由点击触发的)
 */
export function useGetNodeDetail() {
  return useMutation({
    mutationFn: (id) => graphAPI.getNodeDetail(id),
  });
}

/**
 * 搜索实体
 */
export function useSearchEntity() {
  return useMutation({
    mutationFn: (keyword) => graphAPI.searchEntity(keyword),
  });
}
