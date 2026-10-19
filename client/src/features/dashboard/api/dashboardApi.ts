import type { DashboardAlerts, DashboardSummary, MovementsChart, MovementsChartParams } from '@inventory/shared';
import api from '@/lib/axios';

export const fetchSummary = async (): Promise<DashboardSummary> => {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary');
  return data;
};

export const fetchAlerts = async (): Promise<DashboardAlerts> => {
  const { data } = await api.get<DashboardAlerts>('/dashboard/alerts');
  return data;
};

export const fetchMovementsChart = async (params: MovementsChartParams): Promise<MovementsChart> => {
  const { data } = await api.get<MovementsChart>('/dashboard/movements-chart', { params });
  return data;
};
