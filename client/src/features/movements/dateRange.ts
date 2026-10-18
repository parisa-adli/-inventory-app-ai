import type { DateRange } from 'react-day-picker';

/**
 * The picked local days as the inclusive instants GET /api/stock-movements expects: the first day from
 * 00:00:00.000 and the last day to 23:59:59.999, in the browser's timezone. One picked day is a one-day range.
 */
export const toInstantRange = (range: DateRange | undefined): { dateFrom?: string; dateTo?: string } => {
  if (!range?.from) return {};
  const last = range.to ?? range.from;
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
};

const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** "Oct 1, 2026 – Oct 5, 2026", or one date for a one-day range. */
export const formatDayRange = (from: Date, to?: Date) =>
  !to || to.getTime() === from.getTime() ? dayFormat.format(from) : dayFormat.formatRange(from, to);
