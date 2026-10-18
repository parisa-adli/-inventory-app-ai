import type { CreateStockMovementInput, StockMovement } from '@inventory/shared';
import api from '@/lib/axios';

export const recordMovement = async (body: CreateStockMovementInput): Promise<StockMovement> => {
  const { data } = await api.post<StockMovement>('/stock-movements', body);
  return data;
};
