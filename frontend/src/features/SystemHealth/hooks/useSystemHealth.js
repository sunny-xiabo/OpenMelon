import { useQuery } from '@tanstack/react-query';
import { systemAPI } from '../../../api/system';

export const SYSTEM_HEALTH_KEYS = {
  health: ['system-health'],
};

export function useSystemHealth() {
  return useQuery({
    queryKey: SYSTEM_HEALTH_KEYS.health,
    queryFn: systemAPI.health,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
