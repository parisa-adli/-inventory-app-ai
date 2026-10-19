import type { MovementsChartGranularity, MovementsChartRange } from '../schemas/dashboard';
import type { STOCK_STATUSES, StockStatus } from '../constants/stock-status';
import type { UnitOfMeasure } from '../constants/units';

/** One day or week of the In-vs-Out chart. Quantities are summed across units (pcs, kg, ...). */
export interface MovementsChartBucket {
  /** The instant the bucket starts: midnight (a Monday's, for weeks) in the requested `tz`, as ISO UTC. */
  bucketStart: string;
  /** Σ received units. */
  received: number;
  /** Σ shipped units, positive. */
  shipped: number;
}

/** GET /api/dashboard/movements-chart (C26): every bucket of the window, oldest first, today's last; adjustments excluded. */
export interface MovementsChart {
  range: MovementsChartRange;
  granularity: MovementsChartGranularity;
  buckets: MovementsChartBucket[];
}

/** GET /api/dashboard/summary (C26): the five stat cards, active products only. Money is rounded to 2 decimals. */
export interface DashboardSummary {
  totalProducts: number;
  /** Σ costPrice × quantity. */
  totalStockValue: number;
  /** Σ salePrice × quantity. */
  totalStockIncome: number;
  /** Quantity 1–threshold (the stored low-stock threshold). */
  lowStockCount: number;
  outOfStockCount: number;
}

/** One row of the reorder alerts: an active product that is out of stock or low. */
export interface DashboardAlert {
  id: string;
  title: string;
  sku: string;
  quantity: number;
  unit: UnitOfMeasure;
  status: Exclude<StockStatus, typeof STOCK_STATUSES.IN>;
}

/** GET /api/dashboard/alerts (C26): out first, then low by quantity ascending, then title; at most 20 `items`, `total` counts all. */
export interface DashboardAlerts {
  items: DashboardAlert[];
  total: number;
}
