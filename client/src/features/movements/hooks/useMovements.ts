import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StockMovementListParams } from '@inventory/shared';
import * as movementsApi from '../api/movementsApi';

/** The Stock Movements page and every product's Stock History share this root. */
export const movementsKeys = {
  all: ['stock-movements'] as const,
  list: (params: StockMovementListParams) => ['stock-movements', 'list', params] as const,
};

export const useMovements = (params: StockMovementListParams) =>
  useQuery({
    queryKey: movementsKeys.list(params),
    queryFn: () => movementsApi.fetchMovements(params),
    placeholderData: keepPreviousData,
  });
