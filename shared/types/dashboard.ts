import type { DashboardRange, MovementsChartGranularity } from '../schemas/dashboard';
import type { STOCK_STATUSES, StockStatus } from '../constants/stock-status';
import type { UnitOfMeasure } from '../constants/units';

/** One hour, day, week or month of the In-vs-Out chart. Quantities are summed across units (pcs, kg, ...). */
export interface MovementsChartBucket {
  /** The instant the bucket starts: the hour, or midnight (a Monday's for weeks, the 1st's for months) in `tz`, as ISO UTC. */
  bucketStart: string;
  /** Σ received units. */
  receivedUnits: number;
  /** Σ shipped units, positive. */
  shippedUnits: number;
  /** Σ received units × unit cost, rounded to 2 decimals. */
  receivedValue: number;
  /** Σ shipped units × unit price, rounded to 2 decimals. */
  shippedValue: number;
}

/** GET /api/dashboard/movements-chart (C26): every bucket of the window, oldest first, the current one last; adjustments excluded. */
export interface MovementsChart {
  range: DashboardRange;
  granularity: MovementsChartGranularity;
  buckets: MovementsChartBucket[];
}

/** GET /api/dashboard/period-summary: money moved by receives and ships in the range. Rounded to 2 decimals. */
export interface DashboardPeriodSummary {
  /** Σ received units × unit cost. */
  inboundValue: number;
  /** Σ shipped units × unit price. */
  income: number;
  /** Σ shipped units × unit cost (the cost recorded on each shipment). */
  cogs: number;
  /** income − cogs. */
  grossProfit: number;
}

/** GET /api/dashboard/summary (C26): the "Right now" cards, active products only. Money is rounded to 2 decimals. */
export interface DashboardSummary {
  totalProducts: number;
  /** Σ costPrice × quantity. */
  totalStockValue: number;
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

/** GET /api/dashboard/alerts (C26): out first, then low by quantity ascending, then title; at most 5 `items`, `total` counts all. */
export interface DashboardAlerts {
  items: DashboardAlert[];
  total: number;
}
