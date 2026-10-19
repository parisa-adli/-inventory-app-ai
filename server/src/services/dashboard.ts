import mongoose from 'mongoose';
import {
  MOVEMENTS_CHART_RANGES,
  STOCK_MOVEMENT_TYPES,
  type MovementsChart,
  type MovementsChartGranularity,
  type MovementsChartQuery,
} from '@inventory/shared';
import { StockMovement } from '../models/StockMovement.js';

/** The start of the local day, or of the ISO week (Monday), that `date` (a Date, field path or expression) falls in. */
const truncate = (date: unknown, unit: MovementsChartGranularity, timezone: string) => ({
  $dateTrunc: { date, unit, timezone, ...(unit === 'week' && { startOfWeek: 'monday' }) },
});

/**
 * The start of every bucket of the window, oldest first, the current one last. MongoDB computes them and each is
 * truncated again, so they are exactly the instants `$dateTrunc` groups movements under, even on a DST day whose
 * midnight is skipped. `$documents` needs MongoDB 5.1+.
 */
const bucketStarts = async (unit: MovementsChartGranularity, count: number, timezone: string, now: Date): Promise<Date[]> => {
  const shifted = { $dateAdd: { startDate: truncate(now, unit, timezone), unit, amount: '$amount', timezone } };
  const rows = await mongoose.connection
    .db!.aggregate<{ start: Date }>([
      { $documents: Array.from({ length: count }, (_, i) => ({ amount: i - count + 1 })) },
      { $project: { _id: 0, start: truncate(shifted, unit, timezone) } },
    ])
    .toArray();
  return rows.map((row) => row.start).sort((a, b) => a.getTime() - b.getTime());
};

/** GET /api/dashboard/movements-chart (C26). `now` is a parameter so tests can pin "today". */
export const movementsChart = async ({ range, tz }: MovementsChartQuery, now = new Date()): Promise<MovementsChart> => {
  const { granularity, bucketCount } = MOVEMENTS_CHART_RANGES[range];
  const starts = await bucketStarts(granularity, bucketCount, tz, now);
  const isType = (type: string) => ({ $eq: ['$type', type] });
  // Adjustments are left out (Open Question 12); a ship's delta is negative, the chart counts it as units out
  const totals = await StockMovement.aggregate<{ _id: Date; received: number; shipped: number }>([
    {
      $match: {
        type: { $in: [STOCK_MOVEMENT_TYPES.RECEIVE, STOCK_MOVEMENT_TYPES.SHIP] },
        occurredAt: { $gte: starts[0], $lte: now },
      },
    },
    {
      $group: {
        _id: truncate('$occurredAt', granularity, tz),
        received: { $sum: { $cond: [isType(STOCK_MOVEMENT_TYPES.RECEIVE), '$delta', 0] } },
        shipped: { $sum: { $cond: [isType(STOCK_MOVEMENT_TYPES.SHIP), { $abs: '$delta' }, 0] } },
      },
    },
  ]);
  const byStart = new Map(totals.map(({ _id, received, shipped }) => [_id.getTime(), { received, shipped }]));
  return {
    range,
    granularity,
    buckets: starts.map((start) => ({
      bucketStart: start.toISOString(),
      ...(byStart.get(start.getTime()) ?? { received: 0, shipped: 0 }),
    })),
  };
};
