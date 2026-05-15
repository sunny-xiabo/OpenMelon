import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configCenterAPI } from '../../../api/configCenter';
import { useSnackbar } from '../../../components/SnackbarProvider';

const CONFIG_KEYS = {
  schema: ['config', 'schema'],
  preview: (draft) => ['config', 'preview', draft],
};

/**
 * 获取配置大纲与状态
 */
export function useConfigSchema() {
  return useQuery({
    queryKey: CONFIG_KEYS.schema,
    queryFn: configCenterAPI.getSchema,
  });
}

/**
 * 获取生效值预览
 * @param {Object} draft 
 * @param {Boolean} envExists 
 */
export function useConfigPreview(draft, envExists) {
  return useQuery({
    queryKey: CONFIG_KEYS.preview(draft),
    queryFn: () => configCenterAPI.previewValues(draft),
    enabled: envExists && Object.keys(draft).length > 0,
    // 预览请求通常不需要长时间缓存
    staleTime: 0,
  });
}

/**
 * 保存配置项
 */
export function useSaveConfig() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: (values) => configCenterAPI.saveValues(values),
    onSuccess: (data) => {
      // 关键：保存成功后，立即让 schema 缓存失效，从而触发全局刷新
      queryClient.invalidateQueries({ queryKey: CONFIG_KEYS.schema });
      
      const message = data.restart_required 
        ? '已保存，部分配置需重启生效' 
        : '已保存，热更新配置已生效';
      snackbar(message, { severity: 'success' });
    },
    onError: (error) => {
      snackbar(error.message || '保存失败', { severity: 'error' });
    },
  });
}

/**
 * 保存 Provider
 */
export function useSaveProvider() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: (provider) => configCenterAPI.saveProvider(provider),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CONFIG_KEYS.schema });
      snackbar(`Provider ${data.provider?.key} 已保存`, { severity: 'success' });
    },
    onError: (error) => {
      snackbar(error.message || 'Provider 保存失败', { severity: 'error' });
    },
  });
}

/**
 * 删除 Provider
 */
export function useDeleteProvider() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: (key) => configCenterAPI.deleteProvider(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG_KEYS.schema });
      snackbar('Provider 已删除', { severity: 'success' });
    },
    onError: (error) => {
      snackbar(error.message || '删除失败', { severity: 'error' });
    },
  });
}
