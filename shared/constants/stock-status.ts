/**
 * The low-stock threshold until an admin changes it (C25). The live value is `Settings.lowStockThreshold`: pass it
 * to `getStockStatus` and `stockStatusRange`, never this constant.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export const STOCK_STATUSES = {
  IN: 'in',
  LOW: 'low',
  OUT: 'out',
} as const;

export type StockStatus = typeof STOCK_STATUSES[keyof typeof STOCK_STATUSES];

/**
 * The one definition of stock status (out = 0, low = 1–threshold, in = above it), shared by the products filter,
 * the badges and the dashboard. `threshold` is the stored low-stock threshold.
 */
export const getStockStatus = (quantity: number, threshold: number): StockStatus => {
  if (quantity <= 0) return STOCK_STATUSES.OUT;
  if (quantity <= threshold) return STOCK_STATUSES.LOW;
  return STOCK_STATUSES.IN;
};

/**
 * The quantities a status covers, for filtering in the database (`min`/`max` inclusive, whole units).
 * Mirrors `getStockStatus`; the stock-status test checks the two agree at every boundary.
 */
export const stockStatusRange = (status: StockStatus, threshold: number): { min?: number; max?: number } => {
  switch (status) {
    case STOCK_STATUSES.OUT:
      return { max: 0 };
    case STOCK_STATUSES.LOW:
      return { min: 1, max: threshold };
    case STOCK_STATUSES.IN:
      return { min: threshold + 1 };
  }
};
