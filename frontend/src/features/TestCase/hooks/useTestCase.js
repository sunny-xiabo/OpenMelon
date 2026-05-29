import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testCaseAPI, vectorAPI, graphAPI } from '../../../services/api';
import { useSnackbar } from '../../../components/SnackbarProvider';

export const TESTCASE_KEYS = {
  vectorStatus: ['testcase', 'vector', 'status'],
  modules: ['testcase', 'modules'],
};

/**
 * 检查向量库状态
 */
export function useVectorStatus(enabled = true) {
  return useQuery({
    queryKey: TESTCASE_KEYS.vectorStatus,
    queryFn: async () => {
      try {
        return await vectorAPI.checkStatus();
      } catch {
        return { available: false, message: '检查失败' };
      }
    },
    enabled,
    // 每 30 秒自动刷新一次，确保状态实时
    refetchInterval: 30000,
  });
}

/**
 * 获取可用模块列表（用于下拉选择）
 */
export function useAvailableModules(enabled = true) {
  return useQuery({
    queryKey: TESTCASE_KEYS.modules,
    queryFn: async () => {
      const filters = await graphAPI.getFilters();
      return filters.modules || [];
    },
    enabled,
  });
}

/**
 * 将测试用例存入向量库
 */
export function useStoreToVector() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: ({ testCases, moduleName }) => vectorAPI.storeTestCases(testCases, moduleName),
    onSuccess: (result) => {
      if (result.success) {
        showSnackbar(result.message, { severity: 'success' });
        // 成功后刷新向量库状态
        queryClient.invalidateQueries({ queryKey: TESTCASE_KEYS.vectorStatus });
      } else {
        showSnackbar(result.message || '存储失败', { severity: 'error' });
      }
    },
    onError: (error) => {
      showSnackbar('存储失败: ' + error.message, { severity: 'error' });
    },
  });
}

/**
 * 导出测试用例（通用导出逻辑）
 */
export function useExportTestCases() {
  const showSnackbar = useSnackbar();

  return useMutation({
    mutationFn: async ({ type, data }) => {
      if (type === 'excel') {
        return await testCaseAPI.exportToExcel(data);
      } else if (type === 'markdown') {
        return await testCaseAPI.exportMarkdown(data);
      } else if (type === 'xmind') {
        return await testCaseAPI.exportXMind(data);
      }
      throw new Error('不支持的导出类型');
    },
    onSuccess: (blob, { type }) => {
      const extMap = { xmind: 'xmind', markdown: 'md', excel: 'xlsx' };
      const extension = extMap[type] || 'xlsx';
      const filename = `测试用例_${new Date().getTime()}.${extension}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      showSnackbar(`导出 ${type.toUpperCase()} 成功`, { severity: 'success' });
    },
    onError: (error) => {
      showSnackbar('导出失败: ' + error.message, { severity: 'error' });
    },
  });
}
