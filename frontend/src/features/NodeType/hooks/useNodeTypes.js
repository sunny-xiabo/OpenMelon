import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { graphAPI } from '../../../services/api';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { 
  loadNodeTypeOverrides, 
  saveNodeTypeOverrides, 
  mergeNodeTypeConfigs, 
  buildNodeTypeHelpers 
} from '../../../theme/nodeTypes';

export const NODE_TYPE_KEYS = {
  all: ['node-types'],
  overrides: ['node-types', 'overrides'],
};

/**
 * 获取服务器节点类型
 */
export function useNodeTypes() {
  return useQuery({
    queryKey: NODE_TYPE_KEYS.all,
    queryFn: async () => {
      const data = await graphAPI.getNodeTypes();
      return data.node_types || [];
    },
  });
}

/**
 * 管理本地 Overrides
 */
export function useNodeTypeOverrides() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NODE_TYPE_KEYS.overrides,
    queryFn: () => loadNodeTypeOverrides(),
    staleTime: Infinity, // 本地数据永不过期
  });

  // 同步方法
  const updateOverride = React.useCallback((type, patch) => {
    const prev = query.data || {};
    const next = { ...prev, [type]: { ...(prev[type] || {}), ...patch } };
    saveNodeTypeOverrides(next);
    queryClient.setQueryData(NODE_TYPE_KEYS.overrides, next);
  }, [query.data, queryClient]);

  const resetOverride = React.useCallback((type) => {
    const next = { ...(query.data || {}) };
    delete next[type];
    saveNodeTypeOverrides(next);
    queryClient.setQueryData(NODE_TYPE_KEYS.overrides, next);
  }, [query.data, queryClient]);

  const resetAll = React.useCallback(() => {
    saveNodeTypeOverrides({});
    queryClient.setQueryData(NODE_TYPE_KEYS.overrides, {});
  }, [queryClient]);

  return { ...query, updateOverride, resetOverride, resetAll };
}

/**
 * 获取合并后的节点类型图例 (Legend)
 */
export function useNodeTypeLegend() {
  const nodeTypes = useNodeTypes();
  const overrides = useNodeTypeOverrides();

  const legend = React.useMemo(() => {
    if (!nodeTypes.data) return [];
    return buildNodeTypeHelpers(mergeNodeTypeConfigs(nodeTypes.data, overrides.data || {})).legend;
  }, [nodeTypes.data, overrides.data]);

  return {
    isLoading: nodeTypes.isLoading || overrides.isLoading,
    data: legend,
  };
}

/**
 * Mutation: 保存节点类型
 */
export function useSaveNodeType(mode, originalType) {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: (payload) => {
      return mode === 'create' 
        ? graphAPI.createNodeType(payload) 
        : graphAPI.updateNodeType(originalType, payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: NODE_TYPE_KEYS.all });
      showSnackbar(mode === 'create' ? `已创建节点类型 ${variables.type}` : `已更新节点类型 ${originalType}`, { severity: 'success' });
    },
    onError: (error) => {
      showSnackbar(error.message || '保存节点类型失败', { severity: 'error' });
    }
  });
}

/**
 * Mutation: 删除节点类型
 */
export function useDeleteNodeType() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: (type) => graphAPI.deleteNodeType(type),
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: NODE_TYPE_KEYS.all });
      showSnackbar(`已删除节点类型 ${type}`, { severity: 'success' });
    },
    onError: (error) => {
      showSnackbar(error.message || '删除节点类型失败', { severity: 'error' });
    }
  });
}
