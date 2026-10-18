import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  PRODUCTS_PAGE_SIZE_DEFAULT,
  PRODUCT_SEARCH_MAX,
  PRODUCT_SORTS,
  PRODUCT_SORT_DEFAULT,
  PRODUCT_STATUSES,
  SORT_ORDERS,
  STOCK_STATUSES,
  defaultSortOrder,
  listProductsQuerySchema,
  type ProductListParams,
  type ProductSort,
  type SortOrder,
  type StockStatus,
} from '@inventory/shared';

/** The "All" choice of the filter selects (a Select item cannot have an empty value). */
export const ALL_OPTION = 'all';

const STOCK_STATUS_VALUES: readonly StockStatus[] = Object.values(STOCK_STATUSES);

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

/** The API's own rules for a category id and a supplier id / `unassigned`: a malformed one is dropped, not sent. */
const { category: categoryField, supplier: supplierField } = listProductsQuerySchema.shape;

/**
 * List state of the Products page, kept in the URL
 * (?status=&search=&category=&supplier=&stockStatus=&sort=&order=&page=) so a refresh, a bookmark or a
 * dashboard link opens the same view. Defaults are left out of the URL and invalid values fall back to
 * them. Filters persist across the Active/Archived tabs; any change other than paging returns to page 1.
 */
export const useProductListParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = pick(searchParams.get('status'), PRODUCT_STATUSES) ?? 'active';
  // Cut to what the API accepts, so a hand-edited link still loads
  const search = (searchParams.get('search') ?? '').trim().slice(0, PRODUCT_SEARCH_MAX);
  const category = categoryField.safeParse(searchParams.get('category') ?? undefined).data;
  const supplier = supplierField.safeParse(searchParams.get('supplier') ?? undefined).data;
  const stockStatus = pick(searchParams.get('stockStatus'), STOCK_STATUS_VALUES);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sort = pick(searchParams.get('sort'), PRODUCT_SORTS) ?? PRODUCT_SORT_DEFAULT;
  const order = pick(searchParams.get('order'), SORT_ORDERS) ?? defaultSortOrder(sort);

  const params = useMemo<ProductListParams>(
    () => ({
      status,
      page,
      limit: PRODUCTS_PAGE_SIZE_DEFAULT,
      sort,
      order,
      ...(search && { search }),
      ...(category && { category }),
      ...(supplier && { supplier }),
      ...(stockStatus && { stockStatus }),
    }),
    [status, page, sort, order, search, category, supplier, stockStatus]
  );

  const update = useCallback(
    (changes: Record<string, string | number | null>, options?: { replace?: boolean }) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '' || (key === 'page' && value === 1)) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: options?.replace }
      );
    },
    [setSearchParams]
  );

  const setStatus = useCallback(
    (value: string) => update({ status: pick(value, PRODUCT_STATUSES) === 'archived' ? 'archived' : null, page: 1 }),
    [update]
  );
  /** A new search starts at page 1; typing replaces the history entry. */
  const setSearch = useCallback(
    (value: string) => update({ search: value.trim(), page: 1 }, { replace: true }),
    [update]
  );
  const setCategory = useCallback(
    (value: string) => update({ category: value === ALL_OPTION ? null : value, page: 1 }),
    [update]
  );
  const setSupplier = useCallback(
    (value: string) => update({ supplier: value === ALL_OPTION ? null : value, page: 1 }),
    [update]
  );
  const setStockStatus = useCallback(
    (value: string) => update({ stockStatus: pick(value, STOCK_STATUS_VALUES) ?? null, page: 1 }),
    [update]
  );
  const clearFilters = useCallback(
    () => update({ search: null, category: null, supplier: null, stockStatus: null, page: 1 }),
    [update]
  );
  const setPage = useCallback(
    (value: number, options?: { replace?: boolean }) => update({ page: value }, options),
    [update]
  );
  /** Title A→Z writes neither key; another sort in its default direction writes only `sort`. */
  const setSort = useCallback(
    (nextSort: ProductSort, nextOrder: SortOrder) =>
      update({
        sort: nextSort === PRODUCT_SORT_DEFAULT ? null : nextSort,
        order: nextOrder === defaultSortOrder(nextSort) ? null : nextOrder,
        page: 1,
      }),
    [update]
  );

  return {
    params,
    status,
    search,
    category: category ?? ALL_OPTION,
    supplier: supplier ?? ALL_OPTION,
    stockStatus: stockStatus ?? ALL_OPTION,
    page,
    sort,
    order,
    hasFilters: Boolean(search || category || supplier || stockStatus),
    setStatus,
    setSearch,
    setCategory,
    setSupplier,
    setStockStatus,
    clearFilters,
    setPage,
    setSort,
  };
};

export type ProductListState = ReturnType<typeof useProductListParams>;
