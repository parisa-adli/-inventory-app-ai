import type {
  DashboardAlerts,
  DashboardPeriodSummary,
  DashboardRangeParams,
  DashboardSummary,
  MovementsChart,
} from '@inventory/shared';
import api from '@/lib/axios';

export const fetchSummary = async (): Promise<DashboardSummary> => {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary');
  return data;
};

export const fetchPeriodSummary = async (params: DashboardRangeParams): Promise<DashboardPeriodSummary> => {
  const { data } = await api.get<DashboardPeriodSummary>('/dashboard/period-summary', { params });
  return data;
};

export const fetchAlerts = async (): Promise<DashboardAlerts> => {
  const { data } = await api.get<DashboardAlerts>('/dashboard/alerts');
  return data;
};

export const fetchMovementsChart = async (params: DashboardRangeParams): Promise<MovementsChart> => {
  const { data } = await api.get<MovementsChart>('/dashboard/movements-chart', { params });
  return data;
};
