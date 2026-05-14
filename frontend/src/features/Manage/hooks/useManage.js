import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fileAPI, uploadAPI } from '../../../services/api';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { buildFileStats } from '../utils';

export const MANAGE_KEYS = {
  files: ['manage', 'files'],
  task: (id) => ['manage', 'task', id],
};

/**
 * 获取文件列表
 */
export function useFileList() {
  return useQuery({
    queryKey: MANAGE_KEYS.files,
    queryFn: async () => {
      const data = await fileAPI.list();
      return data.files || [];
    },
  });
}

/**
 * 获取文件统计
 */
export function useFileStats() {
  const { data: files = [] } = useFileList();
  return buildFileStats(files);
}

/**
 * 轮询上传/处理任务状态
 */
export function useTaskStatus(taskId) {
  return useQuery({
    queryKey: MANAGE_KEYS.task(taskId),
    queryFn: () => uploadAPI.getStatus(taskId),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'completed' || status === 'failed') ? false : 2000;
    },
  });
}

/**
 * 文件操作 Mutations
 */
export function useFileActions() {
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();

  const deleteFile = useMutation({
    mutationFn: (id) => fileAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MANAGE_KEYS.files });
      showSnackbar('文件索引已删除', { severity: 'success' });
    }
  });

  const reindexFile = useMutation({
    mutationFn: (id) => fileAPI.reindex(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MANAGE_KEYS.files });
      showSnackbar('重新索引任务已启动', { severity: 'success' });
    }
  });

  return { deleteFile, reindexFile };
}

/**
 * 上传 Mutation
 */
export function useUploadMutation() {
  return useMutation({
    mutationFn: ({ files, docType, module }) => uploadAPI.uploadAsync(files, docType, module),
  });
}
