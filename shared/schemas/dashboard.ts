import { z } from 'zod';

/**
 * The In-vs-Out chart's ranges (C26): days for 7d and 30d, ISO weeks (Monday start) for 90d. Each window ends with
 * the current, partial bucket; 90d is 13 whole weeks (⌈90 / 7⌉).
 */
export const MOVEMENTS_CHART_RANGES = {
  '7d': { granularity: 'day', bucketCount: 7 },
  '30d': { granularity: 'day', bucketCount: 30 },
  '90d': { granularity: 'week', bucketCount: 13 },
} as const;

export type MovementsChartRange = keyof typeof MOVEMENTS_CHART_RANGES;
export type MovementsChartGranularity = (typeof MOVEMENTS_CHART_RANGES)[MovementsChartRange]['granularity'];

const range = z.enum(Object.keys(MOVEMENTS_CHART_RANGES) as [MovementsChartRange, ...MovementsChartRange[]], {
  error: 'Range must be 7d, 30d or 90d',
});

/** A time zone `Intl` knows, in its canonical spelling (`utc` → `UTC`), so the database is never handed an alias. */
const timeZone = z.string({ error: 'tz is required' }).transform((value, ctx) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'tz must be an IANA time zone, e.g. Europe/Berlin' });
    return z.NEVER;
  }
});

/** Query string of GET /api/dashboard/movements-chart. `tz` is the viewer's zone: buckets are cut at its midnights. */
export const movementsChartQuerySchema = z.object({ range, tz: timeZone });

export type MovementsChartQuery = z.infer<typeof movementsChartQuerySchema>;
export type MovementsChartParams = z.input<typeof movementsChartQuerySchema>;
