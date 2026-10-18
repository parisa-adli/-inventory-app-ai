/** A product with this many units or fewer (but more than 0) is low on stock. */
export const LOW_STOCK_THRESHOLD = 10;

export const STOCK_STATUSES = {
  IN: 'in',
  LOW: 'low',
  OUT: 'out',
} as const;

export type StockStatus = typeof STOCK_STATUSES[keyof typeof STOCK_STATUSES];

/** The one definition of stock status (out = 0, low = 1–threshold, in = above it), shared by the products filter and the dashboard. */
export const getStockStatus = (quantity: number): StockStatus => {
  if (quantity <= 0) return STOCK_STATUSES.OUT;
  if (quantity <= LOW_STOCK_THRESHOLD) return STOCK_STATUSES.LOW;
  return STOCK_STATUSES.IN;
};

/**
 * The quantities each status covers, for filtering in the database (`min`/`max` inclusive, whole units).
 * Mirrors `getStockStatus`; the stock-status test checks the two agree at every boundary.
 */
export const STOCK_STATUS_RANGES: Record<StockStatus, { min?: number; max?: number }> = {
  [STOCK_STATUSES.OUT]: { max: 0 },
  [STOCK_STATUSES.LOW]: { min: 1, max: LOW_STOCK_THRESHOLD },
  [STOCK_STATUSES.IN]: { min: LOW_STOCK_THRESHOLD + 1 },
};
