import type { CreateStockMovementInput, StockMovement, StockMovementListParams, StockMovementsPage } from '@inventory/shared';
import api from '@/lib/axios';

export const fetchMovements = async (params: StockMovementListParams): Promise<StockMovementsPage> => {
  const { data } = await api.get<StockMovementsPage>('/stock-movements', { params });
  return data;
};

export const recordMovement = async (body: CreateStockMovementInput): Promise<StockMovement> => {
  const { data } = await api.post<StockMovement>('/stock-movements', body);
  return data;
};
