import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, STOCK_STATUSES, getStockStatus, stockStatusRange, type StockStatus } from '@inventory/shared';

describe('stock status (out = 0, low = 1–threshold, in = above it)', () => {
  it('defaults to a low-stock threshold of 10', () => {
    expect(DEFAULT_SETTINGS.lowStockThreshold).toBe(10);
  });

  it.each<[number, number, StockStatus]>([
    [0, 10, STOCK_STATUSES.OUT],
    [1, 10, STOCK_STATUSES.LOW],
    [10, 10, STOCK_STATUSES.LOW],
    [11, 10, STOCK_STATUSES.IN],
    [0, 1, STOCK_STATUSES.OUT],
    [1, 1, STOCK_STATUSES.LOW],
    [2, 1, STOCK_STATUSES.IN],
    [25, 25, STOCK_STATUSES.LOW],
    [26, 25, STOCK_STATUSES.IN],
  ])('quantity %i with threshold %i is %s', (quantity, threshold, expected) => {
    expect(getStockStatus(quantity, threshold)).toBe(expected);
  });

  it.each([
    [0, 10],
    [1, 10],
    [10, 10],
    [11, 10],
    [1, 1],
    [2, 1],
    [25, 25],
    [26, 25],
  ])('the database range for quantity %i (threshold %i) agrees with getStockStatus', (quantity, threshold) => {
    const matching = Object.values(STOCK_STATUSES).filter((status) => {
      const { min, max } = stockStatusRange(status, threshold);
      return (min === undefined || quantity >= min) && (max === undefined || quantity <= max);
    });
    expect(matching).toEqual([getStockStatus(quantity, threshold)]);
  });
});
