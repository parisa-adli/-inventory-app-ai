import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  CATALOG_PAGE_SIZE_DEFAULT,
  CATALOG_SORTS,
  SORT_ORDERS,
  defaultSortOrder,
  type CatalogListParams,
  type CatalogSort,
  type SortOrder,
} from '@inventory/shared';

/** The "Sort by" presets; each writes ?sort=&order= (the default, Newest, writes neither). */
export const SORT_PRESETS = [
  { value: 'createdAt-desc', label: 'Newest', sort: 'createdAt', order: 'desc' },
  { value: 'createdAt-asc', label: 'Oldest', sort: 'createdAt', order: 'asc' },
  { value: 'name-asc', label: 'Name A→Z', sort: 'name', order: 'asc' },
  { value: 'name-desc', label: 'Name Z→A', sort: 'name', order: 'desc' },
  { value: 'productCount-desc', label: 'Most products', sort: 'productCount', order: 'desc' },
] as const satisfies { value: string; label: string; sort: CatalogSort; order: SortOrder }[];

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

/**
 * List state of a catalog page, kept in the URL (?search=&page=&sort=&order=) so a refresh or a
 * shared link keeps the place. Defaults are left out of the URL.
 */
export const useCatalogSearchParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sort = pick(searchParams.get('sort'), CATALOG_SORTS) ?? 'createdAt';
  const order = pick(searchParams.get('order'), SORT_ORDERS) ?? defaultSortOrder(sort);

  const params = useMemo<CatalogListParams>(
    () => ({ page, limit: CATALOG_PAGE_SIZE_DEFAULT, sort, order, ...(search && { search }) }),
    [page, sort, order, search]
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

  /** A new search starts at page 1; typing replaces the history entry. */
  const setSearch = useCallback(
    (value: string) => update({ search: value.trim(), page: 1 }, { replace: true }),
    [update]
  );
  const setPage = useCallback(
    (value: number, options?: { replace?: boolean }) => update({ page: value }, options),
    [update]
  );
  const setSortPreset = useCallback(
    (value: string) => {
      const preset = SORT_PRESETS.find((p) => p.value === value) ?? SORT_PRESETS[0];
      const isDefault = preset === SORT_PRESETS[0];
      update({ sort: isDefault ? null : preset.sort, order: isDefault ? null : preset.order, page: 1 });
    },
    [update]
  );

  return { params, search, page, sortPreset: `${sort}-${order}`, setSearch, setPage, setSortPreset };
};
