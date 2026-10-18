import type { PageMeta, Paginated } from '@inventory/shared';

/** The `page` / `limit` of every validated list query. */
type PageQuery = Pick<PageMeta, 'page' | 'limit'>;

/** Rows to skip before the requested page, for `.skip()` or a `$skip` stage. */
export const pageSkip = ({ page, limit }: PageQuery): number => (page - 1) * limit;

/** The list response for one page of `total` matching rows; an empty result is still one page. */
export const toPage = <T>(items: T[], total: number, { page, limit }: PageQuery): Paginated<T> => ({
  items,
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
