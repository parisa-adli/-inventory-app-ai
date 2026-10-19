import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StockMovementListParams, StockMovementsFilterParams } from '@inventory/shared';
import * as movementsApi from '../api/movementsApi';

/** The Stock Movements page (list, cards, users) and every product's Stock History share this root. */
export const movementsKeys = {
  all: ['stock-movements'] as const,
  list: (params: StockMovementListParams) => ['stock-movements', 'list', params] as const,
  summary: (params: StockMovementsFilterParams) => ['stock-movements', 'summary', params] as const,
  users: ['stock-movements', 'users'] as const,
};

export const useMovements = (params: StockMovementListParams) =>
  useQuery({
    queryKey: movementsKeys.list(params),
    queryFn: () => movementsApi.fetchMovements(params),
    placeholderData: keepPreviousData,
  });

export const useMovementsSummary = (params: StockMovementsFilterParams) =>
  useQuery({
    queryKey: movementsKeys.summary(params),
    queryFn: () => movementsApi.fetchMovementsSummary(params),
    placeholderData: keepPreviousData,
  });

export const useMovementUsers = () =>
  useQuery({ queryKey: movementsKeys.users, queryFn: movementsApi.fetchMovementUsers });
