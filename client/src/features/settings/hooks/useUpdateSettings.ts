import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboard';
import { productsKeys } from '@/features/products/hooks/useProducts';
import { getApiError } from '@/lib/apiError';
import { settingsKeys } from '@/lib/settings';
import * as settingsApi from '../api/settingsApi';

/** The saved settings replace the cache; the products filter and the dashboard counts depend on the threshold. */
export const useUpdateSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKeys.all, settings);
      toast.success('Settings saved');
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: productsKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      ]);
    },
    onError: (err) => toast.error(getApiError(err).message),
  });
};
