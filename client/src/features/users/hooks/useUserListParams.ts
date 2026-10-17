import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  ACCOUNT_STATUS,
  SORT_ORDERS,
  USERS_PAGE_SIZE_DEFAULT,
  USER_ROLES,
  USER_SORTS,
  defaultSortOrder,
  type AccountStatus,
  type SortOrder,
  type UserRole,
  type UserSort,
} from '@inventory/shared';
import type { UsersListParams } from '../api/usersApi';

/** The "Sort by" presets; each writes ?sort=&order= (the default, Newest, writes neither). */
export const USER_SORT_PRESETS = [
  { value: 'createdAt-desc', label: 'Newest', sort: 'createdAt', order: 'desc' },
  { value: 'createdAt-asc', label: 'Oldest', sort: 'createdAt', order: 'asc' },
  { value: 'name-asc', label: 'Name A→Z', sort: 'name', order: 'asc' },
  { value: 'name-desc', label: 'Name Z→A', sort: 'name', order: 'desc' },
  { value: 'lastLoginAt-desc', label: 'Recently active', sort: 'lastLoginAt', order: 'desc' },
] as const satisfies { value: string; label: string; sort: UserSort; order: SortOrder }[];

/** The "All" choice of the role and email-status selects (a Select item cannot have an empty value). */
export const ALL_OPTION = 'all';

const STATUSES = Object.values(ACCOUNT_STATUS);
const ROLES = Object.values(USER_ROLES);
const VERIFIED = ['true', 'false'] as const;

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

/**
 * List state of the Users page, kept in the URL (?status=&search=&role=&verified=&sort=&order=&page=)
 * so a refresh or a shared link keeps the view. Defaults are left out of the URL and invalid values
 * fall back to them. Filters persist across tabs; any change other than paging returns to page 1.
 */
export const useUserListParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const status: AccountStatus = pick(searchParams.get('status'), STATUSES) ?? ACCOUNT_STATUS.PENDING;
  const search = (searchParams.get('search') ?? '').trim();
  const role: UserRole | undefined = pick(searchParams.get('role'), ROLES);
  const verified = pick(searchParams.get('verified'), VERIFIED);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sort = pick(searchParams.get('sort'), USER_SORTS) ?? 'createdAt';
  const order = pick(searchParams.get('order'), SORT_ORDERS) ?? defaultSortOrder(sort);

  const params = useMemo<UsersListParams>(
    () => ({
      status,
      page,
      limit: USERS_PAGE_SIZE_DEFAULT,
      sort,
      order,
      ...(search && { search }),
      ...(role && { role }),
      ...(verified && { verified: verified === 'true' }),
    }),
    [status, page, sort, order, search, role, verified]
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
    (value: AccountStatus) => update({ status: value === ACCOUNT_STATUS.PENDING ? null : value, page: 1 }),
    [update]
  );
  /** A new search starts at page 1; typing replaces the history entry. */
  const setSearch = useCallback(
    (value: string) => update({ search: value.trim(), page: 1 }, { replace: true }),
    [update]
  );
  const setRole = useCallback(
    (value: string) => update({ role: pick(value, ROLES) ?? null, page: 1 }),
    [update]
  );
  const setVerified = useCallback(
    (value: string) => update({ verified: pick(value, VERIFIED) ?? null, page: 1 }),
    [update]
  );
  const clearFilters = useCallback(() => update({ search: null, role: null, verified: null, page: 1 }), [update]);
  const setPage = useCallback(
    (value: number, options?: { replace?: boolean }) => update({ page: value }, options),
    [update]
  );
  const setSortPreset = useCallback(
    (value: string) => {
      const preset = USER_SORT_PRESETS.find((p) => p.value === value) ?? USER_SORT_PRESETS[0];
      const isDefault = preset === USER_SORT_PRESETS[0];
      update({ sort: isDefault ? null : preset.sort, order: isDefault ? null : preset.order, page: 1 });
    },
    [update]
  );

  return {
    params,
    status,
    search,
    role: role ?? ALL_OPTION,
    verified: verified ?? ALL_OPTION,
    page,
    sortPreset: `${sort}-${order}`,
    hasFilters: Boolean(search || role || verified),
    setStatus,
    setSearch,
    setRole,
    setVerified,
    clearFilters,
    setPage,
    setSortPreset,
  };
};
