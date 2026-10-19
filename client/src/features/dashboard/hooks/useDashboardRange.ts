import { useSearchParams } from 'react-router';
import {
  DASHBOARD_RANGES,
  DASHBOARD_RANGE_DEFAULT,
  isDashboardDay,
  type DashboardRange,
  type DashboardRangeParams,
} from '@inventory/shared';

/** The viewer's own zone: the server cuts hours, days, weeks and months at its midnights, so "today" is the viewer's today. */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const RANGES = Object.keys(DASHBOARD_RANGES) as DashboardRange[];
const isRange = (value: string | null): value is DashboardRange => RANGES.includes(value as DashboardRange);

const pad = (value: number) => String(value).padStart(2, '0');
/** A local calendar day as `YYYY-MM-DD` (what the server reads in `tz`). */
export const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** `YYYY-MM-DD` as local midnight, for the calendar. */
export const fromDay = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

const dayRange = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
/** "Oct 1 – 19, 2026", or one day when both ends are the same. */
export const formatDayRange = (from: string, to: string) =>
  from === to ? dayRange.format(fromDay(from)) : dayRange.formatRange(fromDay(from), fromDay(to));

const PERIOD_LABELS: Record<Exclude<DashboardRange, 'custom'>, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  all: 'All time',
};

/**
 * The dashboard's time range, kept in `?range=` (30 days by default, left out of the URL) and, for Custom, `?from=` /
 * `?to=` days, so a refresh keeps it. A custom range without valid days (the server's rule) falls back to the default.
 */
export function useDashboardRange() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get('range');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const custom = rangeParam === 'custom' && isDashboardDay(from) && isDashboardDay(to) && from <= to ? { from, to } : null;
  const range: DashboardRange = custom ? 'custom' : isRange(rangeParam) && rangeParam !== 'custom' ? rangeParam : DASHBOARD_RANGE_DEFAULT;

  const params: DashboardRangeParams = { range, tz: TIME_ZONE, ...custom };
  const label = custom ? formatDayRange(custom.from, custom.to) : PERIOD_LABELS[range as Exclude<DashboardRange, 'custom'>];

  const setRange = (next: Exclude<DashboardRange, 'custom'> | { from: string; to: string }) =>
    setSearchParams(
      (search) => {
        search.delete('from');
        search.delete('to');
        if (typeof next === 'object') {
          search.set('range', 'custom');
          search.set('from', next.from);
          search.set('to', next.to);
        } else if (next === DASHBOARD_RANGE_DEFAULT) search.delete('range');
        else search.set('range', next);
        return search;
      },
      { replace: true },
    );

  return { range, custom, params, label, setRange };
}
