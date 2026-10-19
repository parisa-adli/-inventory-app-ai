import mongoose from 'mongoose';
import {
  MOVEMENTS_CHART_RANGES,
  STOCK_MOVEMENT_TYPES,
  STOCK_STATUSES,
  getStockStatus,
  type DashboardAlert,
  type DashboardAlerts,
  type DashboardSummary,
  type MovementsChart,
  type MovementsChartGranularity,
  type MovementsChartQuery,
} from '@inventory/shared';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { stockStatusQuantity } from './products.js';
import { getLowStockThreshold } from './settings.js';
import { NAME_COLLATION } from '../utils/text.js';

/** Active products only: archived ones are left out of every card, count and alert (C26). */
const ACTIVE = { archivedAt: null };

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

/**
 * Σ price × quantity in Decimal128, so cents add up exactly: a double converts at 15 significant digits (19.99 becomes
 * 19.9900000000000), exact for any 2-decimal price. `roundMoney` then rounds the sum to 2 decimals and turns it back
 * into a JSON number.
 */
const moneyTotal = (price: string) => ({ $sum: { $multiply: [{ $toDecimal: price }, '$quantity'] } });
const roundMoney = (total: string) => ({ $toDouble: { $round: [total, 2] } });

/** Counts the products whose quantity matches a `stockStatusQuantity` condition, inside a `$group`. */
const countWhere = (condition: ReturnType<typeof stockStatusQuantity>) => ({
  $sum: {
    $cond: [
      {
        $and: [
          ...(condition.$gte !== undefined ? [{ $gte: ['$quantity', condition.$gte] }] : []),
          ...(condition.$lte !== undefined ? [{ $lte: ['$quantity', condition.$lte] }] : []),
        ],
      },
      1,
      0,
    ],
  },
});

/** GET /api/dashboard/summary (C26): one aggregation over the active products, per request. */
export const dashboardSummary = async (): Promise<DashboardSummary> => {
  const threshold = await getLowStockThreshold();
  const [totals] = await Product.aggregate<DashboardSummary>([
    { $match: ACTIVE },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalStockValue: moneyTotal('$costPrice'),
        totalStockIncome: moneyTotal('$salePrice'),
        lowStockCount: countWhere(stockStatusQuantity(STOCK_STATUSES.LOW, threshold)),
        outOfStockCount: countWhere(stockStatusQuantity(STOCK_STATUSES.OUT, threshold)),
      },
    },
    {
      $project: {
        _id: 0,
        totalProducts: 1,
        totalStockValue: roundMoney('$totalStockValue'),
        totalStockIncome: roundMoney('$totalStockIncome'),
        lowStockCount: 1,
        outOfStockCount: 1,
      },
    },
  ]);
  return totals ?? { totalProducts: 0, totalStockValue: 0, totalStockIncome: 0, lowStockCount: 0, outOfStockCount: 0 };
};

/** The alerts widget shows this many rows; `total` says how many qualify. */
const ALERTS_LIMIT = 20;

/**
 * GET /api/dashboard/alerts (C26): the active products that are out or low. Out is quantity 0, so sorting by
 * quantity puts it first; ties go by title (case-insensitive, as on the products list), then `_id`.
 */
export const dashboardAlerts = async (): Promise<DashboardAlerts> => {
  const threshold = await getLowStockThreshold();
  const filter = {
    ...ACTIVE,
    $or: [STOCK_STATUSES.OUT, STOCK_STATUSES.LOW].map((status) => ({ quantity: stockStatusQuantity(status, threshold) })),
  };
  const [total, rows] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter, { title: 1, sku: 1, quantity: 1, unitOfMeasure: 1 })
      .sort({ quantity: 1, title: 1, _id: 1 })
      .collation(NAME_COLLATION)
      .limit(ALERTS_LIMIT)
      .lean(),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      sku: row.sku,
      quantity: row.quantity,
      unit: row.unitOfMeasure,
      status: getStockStatus(row.quantity, threshold) as DashboardAlert['status'],
    })),
  };
};
