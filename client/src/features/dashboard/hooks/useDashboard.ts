import { useQuery } from '@tanstack/react-query';
import type { DashboardRangeParams } from '@inventory/shared';
import * as dashboardApi from '../api/dashboardApi';

/** Every dashboard widget's query lives under this root, which every stock change and a settings save invalidate. */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: ['dashboard', 'summary'] as const,
  periodSummary: (params: DashboardRangeParams) => ['dashboard', 'period-summary', params] as const,
  alerts: ['dashboard', 'alerts'] as const,
  chart: (params: DashboardRangeParams) => ['dashboard', 'movements-chart', params] as const,
};

export const useDashboardSummary = () => useQuery({ queryKey: dashboardKeys.summary, queryFn: dashboardApi.fetchSummary });

/** No placeholder from the previous range: its totals would show under the new range's heading. */
export const useDashboardPeriodSummary = (params: DashboardRangeParams) =>
  useQuery({ queryKey: dashboardKeys.periodSummary(params), queryFn: () => dashboardApi.fetchPeriodSummary(params) });

export const useDashboardAlerts = () => useQuery({ queryKey: dashboardKeys.alerts, queryFn: dashboardApi.fetchAlerts });

/** No placeholder from the previous range: its bars and empty text would show under the new range. */
export const useMovementsChart = (params: DashboardRangeParams) =>
  useQuery({ queryKey: dashboardKeys.chart(params), queryFn: () => dashboardApi.fetchMovementsChart(params) });
