// Sort direction shared by every paginated list query.

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

const TEXT_SORTS: readonly string[] = ['name', 'title', 'sku'];

/** Order used when the query names a sort but no order: A→Z for names, titles and SKUs, newest (or most) first otherwise. */
export const defaultSortOrder = (sort: string): SortOrder => (TEXT_SORTS.includes(sort) ? 'asc' : 'desc');
