import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STOCK_MOVEMENT_TYPES } from '@inventory/shared';
import { getApiError } from '@/lib/apiError';
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboard';
import { movementsKeys } from '@/features/movements/hooks/useMovements';
import * as stockMovementsApi from '../api/stockMovementsApi';
import { productsKeys } from './useProducts';

const PAST_TENSE = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: 'Received',
  [STOCK_MOVEMENT_TYPES.SHIP]: 'Shipped',
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: 'Adjusted',
} as const;

/**
 * Records a stock change. Not optimistic: the quantity on screen changes only once the server confirms.
 * Success or failure, every screen that shows stock is refetched, so a 409 (a colleague's change won)
 * also brings the real number back.
 */
export const useRecordMovement = () => {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(
      [productsKeys.all, movementsKeys.all, dashboardKeys.all].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    );
  return useMutation({
    mutationFn: stockMovementsApi.recordMovement,
    onSuccess: (movement) => {
      toast.success(`${PAST_TENSE[movement.type]} ${Math.abs(movement.delta)} × ${movement.product.title}`);
      return refresh();
    },
    onError: (err) => {
      toast.error(getApiError(err).message);
      return refresh();
    },
  });
};
