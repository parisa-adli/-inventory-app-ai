import type { MovementsChartGranularity, MovementsChartRange } from '../schemas/dashboard';

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
