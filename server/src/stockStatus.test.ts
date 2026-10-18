import { describe, expect, it } from 'vitest';
import { LOW_STOCK_THRESHOLD, STOCK_STATUSES, getStockStatus, type StockStatus } from '@inventory/shared';

describe('stock status (out = 0, low = 1–10, in = more than 10)', () => {
  it('uses a low-stock threshold of 10', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(10);
  });

  it.each<[number, StockStatus]>([
    [0, STOCK_STATUSES.OUT],
    [1, STOCK_STATUSES.LOW],
    [10, STOCK_STATUSES.LOW],
    [11, STOCK_STATUSES.IN],
  ])('quantity %i is %s', (quantity, expected) => {
    expect(getStockStatus(quantity)).toBe(expected);
  });
});
