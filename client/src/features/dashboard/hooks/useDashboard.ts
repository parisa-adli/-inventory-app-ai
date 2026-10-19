import { useQuery } from '@tanstack/react-query';
import type { MovementsChartParams } from '@inventory/shared';
import * as dashboardApi from '../api/dashboardApi';

/** Every dashboard widget's query lives under this root, which every stock change and a settings save invalidate. */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: ['dashboard', 'summary'] as const,
  alerts: ['dashboard', 'alerts'] as const,
  chart: (params: MovementsChartParams) => ['dashboard', 'movements-chart', params] as const,
};

export const useDashboardSummary = () => useQuery({ queryKey: dashboardKeys.summary, queryFn: dashboardApi.fetchSummary });

export const useDashboardAlerts = () => useQuery({ queryKey: dashboardKeys.alerts, queryFn: dashboardApi.fetchAlerts });

/** No placeholder from the previous range: its totals, bars and empty text would show under the new tab. */
export const useMovementsChart = (params: MovementsChartParams) =>
  useQuery({ queryKey: dashboardKeys.chart(params), queryFn: () => dashboardApi.fetchMovementsChart(params) });
