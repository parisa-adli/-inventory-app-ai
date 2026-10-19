import type {
  CreateStockMovementInput,
  StockMovement,
  StockMovementListParams,
  StockMovementUser,
  StockMovementsFilterParams,
  StockMovementsPage,
  StockMovementsSummary,
} from '@inventory/shared';
import api from '@/lib/axios';

export const fetchMovements = async (params: StockMovementListParams): Promise<StockMovementsPage> => {
  const { data } = await api.get<StockMovementsPage>('/stock-movements', { params });
  return data;
};

export const fetchMovementsSummary = async (params: StockMovementsFilterParams): Promise<StockMovementsSummary> => {
  const { data } = await api.get<StockMovementsSummary>('/stock-movements/summary', { params });
  return data;
};

export const fetchMovementUsers = async (): Promise<StockMovementUser[]> => {
  const { data } = await api.get<StockMovementUser[]>('/stock-movements/users');
  return data;
};

export const recordMovement = async (body: CreateStockMovementInput): Promise<StockMovement> => {
  const { data } = await api.post<StockMovement>('/stock-movements', body);
  return data;
};
