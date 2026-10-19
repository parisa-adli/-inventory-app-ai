import mongoose from 'mongoose';
import {
  STOCK_MOVEMENT_TYPES,
  STOCK_STATUSES,
  getStockStatus,
  type DashboardAlert,
  type DashboardAlerts,
  type DashboardPeriodSummary,
  type DashboardRangeQuery,
  type DashboardSummary,
  type MovementsChart,
  type MovementsChartBucket,
  type MovementsChartGranularity,
} from '@inventory/shared';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { stockStatusQuantity } from './products.js';
import { getLowStockThreshold } from './settings.js';
import { NAME_COLLATION } from '../utils/text.js';

/** Active products only: archived ones are left out of every card, count and alert (C26). */
const ACTIVE = { archivedAt: null };

/** The start of the local hour, day, ISO week (Monday) or month that `date` (a Date, field path or expression) falls in. */
const truncate = (date: unknown, unit: MovementsChartGranularity, timezone: string) => ({
  $dateTrunc: { date, unit, timezone, ...(unit === 'week' && { startOfWeek: 'monday' }) },
});

const shift = (date: unknown, unit: MovementsChartGranularity, amount: unknown, timezone: string) => ({
  $dateAdd: { startDate: date, unit, amount, timezone },
});

/** Evaluates date expressions once in MongoDB, which knows every zone's midnights. `$documents` needs MongoDB 5.1+. */
const evaluate = async <T extends object>(fields: Record<keyof T, unknown>): Promise<T> => {
  const [row] = await mongoose.connection
    .db!.aggregate<T>([{ $documents: [{}] }, { $project: { _id: 0, ...fields } }])
    .toArray();
  return row;
};

/**
 * Hours within one local day, days up to 31 of them, ISO weeks up to half a year (183 days), then months. `days` counts
 * local midnights crossed, so a 25-hour day (DST ends) does not push a window into the next size.
 */
const granularityFor = (days: number): MovementsChartGranularity =>
  days < 1 ? 'hour' : days < 31 ? 'day' : days < 183 ? 'week' : 'month';

export interface DashboardWindow {
  start: Date;
  /** Inclusive: now, or a custom range's last instant when that is earlier. */
  end: Date;
  granularity: MovementsChartGranularity;
}

/**
 * The instants a dashboard range covers, in the viewer's zone. Day arithmetic is truncated again so a midnight that
 * DST skips still lands on the day's real start; a custom day is read at its noon, which always exists. All time starts
 * on the day of the first movement (today when there is none). `now` is a parameter so tests can pin it.
 */
export const resolveWindow = async ({ range, tz, from, to }: DashboardRangeQuery, now = new Date()): Promise<DashboardWindow> => {
  const day = (date: unknown) => truncate(date, 'day', tz);
  const today = day(now);
  const noon = (value: string) => ({ $dateFromString: { dateString: `${value}T12:00:00`, timezone: tz } });
  const first = range === 'all' ? await StockMovement.findOne({}, { occurredAt: 1 }).sort({ occurredAt: 1 }).lean() : null;
  const startExpression = {
    today,
    '7d': day(shift(today, 'day', -6, tz)),
    '30d': day(shift(today, 'day', -29, tz)),
    month: truncate(now, 'month', tz),
    all: first ? day(first.occurredAt) : today,
    custom: day(noon(from ?? '')),
  }[range];
  // A custom range ends at the last millisecond of its `to` day, or now when that is earlier
  const endExpression =
    range === 'custom' && to ? { $min: [{ $subtract: [day(shift(noon(to), 'day', 1, tz)), 1] }, now] } : now;
  const { window } = await evaluate<{ window: { start: Date; end: Date; days: number } }>({
    window: {
      $let: {
        vars: { start: startExpression, end: endExpression },
        in: {
          start: '$$start',
          end: '$$end',
          days: { $dateDiff: { startDate: '$$start', endDate: '$$end', unit: 'day', timezone: tz } },
        },
      },
    },
  });
  return { start: window.start, end: window.end, granularity: granularityFor(window.days) };
};

/**
 * The start of every bucket from the one holding `start` to the one holding `end`, oldest first. Each is truncated
 * again, so they are exactly the instants `$dateTrunc` groups movements under, even on a DST day whose midnight is
 * skipped. A window that starts after it ends (a custom range in the future) has none.
 */
const bucketStarts = async ({ start, end, granularity: unit }: DashboardWindow, timezone: string): Promise<Date[]> => {
  if (start > end) return [];
  const first = truncate(start, unit, timezone);
  const span = {
    $dateDiff: {
      startDate: first,
      endDate: truncate(end, unit, timezone),
      unit,
      timezone,
      ...(unit === 'week' && { startOfWeek: 'monday' }),
    },
  };
  const { starts } = await evaluate<{ starts: Date[] }>({
    starts: {
      $map: {
        input: { $range: [0, { $add: [span, 1] }] },
        as: 'i',
        in: truncate(shift(first, unit, '$$i', timezone), unit, timezone),
      },
    },
  });
  return starts.sort((a, b) => a.getTime() - b.getTime());
};

const isType = (type: string) => ({ $eq: ['$type', type] });
const RECEIVED = isType(STOCK_MOVEMENT_TYPES.RECEIVE);
const SHIPPED = isType(STOCK_MOVEMENT_TYPES.SHIP);
/** A ship's delta is negative; the dashboard counts it as units out. */
const UNITS_OUT = { $abs: '$delta' };
const sumWhen = (condition: unknown, value: unknown) => ({ $sum: { $cond: [condition, value, 0] } });

/** Receives and ships in the window: adjustments are left out of the chart and the period cards (Open Question 12). */
const inWindow = ({ start, end }: DashboardWindow) => ({
  $match: {
    type: { $in: [STOCK_MOVEMENT_TYPES.RECEIVE, STOCK_MOVEMENT_TYPES.SHIP] },
    occurredAt: { $gte: start, $lte: end },
  },
});

const toCents = (value: number) => Math.round(value * 100) / 100;

/** GET /api/dashboard/movements-chart (C26): units and money in and out per bucket, zero-filled. */
export const movementsChart = async (query: DashboardRangeQuery, now = new Date()): Promise<MovementsChart> => {
  const window = await resolveWindow(query, now);
  const { granularity } = window;
  const [starts, totals] = await Promise.all([
    bucketStarts(window, query.tz),
    StockMovement.aggregate<{ _id: Date } & Omit<MovementsChartBucket, 'bucketStart'>>([
      inWindow(window),
      {
        $group: {
          _id: truncate('$occurredAt', granularity, query.tz),
          receivedUnits: sumWhen(RECEIVED, '$delta'),
          shippedUnits: sumWhen(SHIPPED, UNITS_OUT),
          receivedValue: sumWhen(RECEIVED, { $multiply: ['$delta', '$unitCost'] }),
          shippedValue: sumWhen(SHIPPED, { $multiply: [UNITS_OUT, '$unitPrice'] }),
        },
      },
    ]),
  ]);
  const byStart = new Map(totals.map(({ _id, ...bucket }) => [_id.getTime(), bucket]));
  return {
    range: query.range,
    granularity,
    buckets: starts.map((start) => {
      const bucket = byStart.get(start.getTime());
      return {
        bucketStart: start.toISOString(),
        receivedUnits: bucket?.receivedUnits ?? 0,
        shippedUnits: bucket?.shippedUnits ?? 0,
        receivedValue: toCents(bucket?.receivedValue ?? 0),
        shippedValue: toCents(bucket?.shippedValue ?? 0),
      };
    }),
  };
};

/** GET /api/dashboard/period-summary: the range's cards, from the prices recorded on each movement. */
export const dashboardPeriodSummary = async (query: DashboardRangeQuery, now = new Date()): Promise<DashboardPeriodSummary> => {
  const [totals] = await StockMovement.aggregate<Omit<DashboardPeriodSummary, 'grossProfit'>>([
    inWindow(await resolveWindow(query, now)),
    {
      $group: {
        _id: null,
        inboundValue: sumWhen(RECEIVED, { $multiply: ['$delta', '$unitCost'] }),
        income: sumWhen(SHIPPED, { $multiply: [UNITS_OUT, '$unitPrice'] }),
        cogs: sumWhen(SHIPPED, { $multiply: [UNITS_OUT, '$unitCost'] }),
      },
    },
  ]);
  const income = toCents(totals?.income ?? 0);
  const cogs = toCents(totals?.cogs ?? 0);
  return { inboundValue: toCents(totals?.inboundValue ?? 0), income, cogs, grossProfit: toCents(income - cogs) };
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
        lowStockCount: countWhere(stockStatusQuantity(STOCK_STATUSES.LOW, threshold)),
        outOfStockCount: countWhere(stockStatusQuantity(STOCK_STATUSES.OUT, threshold)),
      },
    },
    {
      $project: {
        _id: 0,
        totalProducts: 1,
        totalStockValue: roundMoney('$totalStockValue'),
        lowStockCount: 1,
        outOfStockCount: 1,
      },
    },
  ]);
  return totals ?? { totalProducts: 0, totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0 };
};

/** The alerts widget shows this many rows; `total` says how many qualify. */
const ALERTS_LIMIT = 5;

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
