import { describe, expect, it } from 'vitest';
import { pageSkip, toPage } from './pagination.js';

describe('pagination', () => {
  it('skips the rows of every earlier page', () => {
    expect(pageSkip({ page: 1, limit: 20 })).toBe(0);
    expect(pageSkip({ page: 3, limit: 12 })).toBe(24);
  });

  it('reports one page when nothing matches', () => {
    expect(toPage([], 0, { page: 1, limit: 20 })).toEqual({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('counts a partial last page', () => {
    expect(toPage(['y', 'z'], 26, { page: 3, limit: 12 })).toEqual({
      items: ['y', 'z'],
      page: 3,
      limit: 12,
      total: 26,
      totalPages: 3,
    });
  });
});
