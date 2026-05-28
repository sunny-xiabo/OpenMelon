import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configCenterAPI } from '../../../api/configCenter';
import { useSnackbar } from '../../../components/SnackbarProvider';

const SLOT_KEYS = {
  slotConfig: ['testcase', 'slotConfig'],
};

export function useSlotConfig() {
  return useQuery({
    queryKey: SLOT_KEYS.slotConfig,
    queryFn: configCenterAPI.getSlotConfig,
  });
}

export function useSaveSlotConfig() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  return useMutation({
    mutationFn: (slots) => configCenterAPI.saveSlotConfig(slots),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SLOT_KEYS.slotConfig });
      queryClient.invalidateQueries({ queryKey: ['config', 'schema'] });
      snackbar('槽位配置已保存，热生效', { severity: 'success' });
    },
    onError: (error) => {
      snackbar(error.message || '槽位配置保存失败', { severity: 'error' });
    },
  });
}
