import { z } from 'zod';

/**
 * The dashboard's time ranges: the page's dropdown, which drives the period cards and the In-vs-Out chart. Each one
 * ends now (Custom: the end of its last day, or now when that is later); 7d and 30d are whole local days, today included.
 */
export const DASHBOARD_RANGES = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  month: 'This month',
  all: 'All time',
  custom: 'Custom',
} as const;

export type DashboardRange = keyof typeof DASHBOARD_RANGES;
export const DASHBOARD_RANGE_DEFAULT: DashboardRange = '30d';

/** How the chart buckets a window: by hour within a day, by day up to a month, by ISO week up to half a year, else by month. */
export type MovementsChartGranularity = 'hour' | 'day' | 'week' | 'month';

const range = z.enum(Object.keys(DASHBOARD_RANGES) as [DashboardRange, ...DashboardRange[]], {
  error: 'Range must be today, 7d, 30d, month, all or custom',
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

/** The first day a custom range may start on. */
export const DASHBOARD_FIRST_DAY = '2000-01-01';

/** A real calendar day as `YYYY-MM-DD` (no Feb 30), from `DASHBOARD_FIRST_DAY` on: the rule for a custom range's days. */
export const isDashboardDay = (value: string | null | undefined): value is string =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= DASHBOARD_FIRST_DAY &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** A calendar day in the viewer's zone (see `isDashboardDay`). */
const localDay = (label: string) =>
  z.string().refine(isDashboardDay, { error: `${label} must be a real YYYY-MM-DD day from 2000 on` });

/**
 * Query string of GET /api/dashboard/movements-chart and /period-summary. `tz` is the viewer's zone: days, weeks and
 * months are cut at its midnights. `from` and `to` (both inclusive) are required for, and only read by, `custom`.
 */
export const dashboardRangeQuerySchema = z
  .object({ range, tz: timeZone, from: localDay('from').optional(), to: localDay('to').optional() })
  .superRefine(({ range, from, to }, ctx) => {
    if (range !== 'custom') return;
    if (!from) ctx.addIssue({ code: 'custom', path: ['from'], message: 'from is required for a custom range' });
    if (!to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to is required for a custom range' });
    if (from && to && from > to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to cannot be before from' });
  });

export type DashboardRangeQuery = z.infer<typeof dashboardRangeQuerySchema>;
export type DashboardRangeParams = z.input<typeof dashboardRangeQuerySchema>;
