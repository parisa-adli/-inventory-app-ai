/** The picked local days; either end may be open. */
export interface DayRange {
  from?: Date;
  to?: Date;
}

/**
 * The picked local days as the inclusive instants GET /api/stock-movements expects: the first day from
 * 00:00:00.000 and the last day to 23:59:59.999, in the browser's timezone. Each end is optional.
 */
export const toInstantRange = ({ from, to }: DayRange): { dateFrom?: string; dateTo?: string } => ({
  ...(from && { dateFrom: new Date(from.getFullYear(), from.getMonth(), from.getDate()).toISOString() }),
  ...(to && { dateTo: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).toISOString() }),
});
