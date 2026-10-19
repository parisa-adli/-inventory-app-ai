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

/** The "All" choice of the selects, and the All tab (a Select item cannot have an empty value). */
export const ALL_OPTION = 'all';

/** The Users page tabs: every account, or one status. */
export type UsersTab = typeof ALL_OPTION | AccountStatus;

const STATUSES = Object.values(ACCOUNT_STATUS);
const TABS: readonly UsersTab[] = [ALL_OPTION, ...STATUSES];
const ROLES = Object.values(USER_ROLES);
const VERIFIED = ['true', 'false'] as const;

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

/**
 * List state of the Users page, kept in the URL (?status=&statusFilter=&search=&role=&verified=&sort=&order=&page=)
 * so a refresh or a shared link keeps the view. `status` is the tab (All when absent); `statusFilter` is the
 * All tab's status select and is ignored on the other tabs. Defaults are left out of the URL and invalid values
 * fall back to them. Filters persist across tabs; any change other than paging returns to page 1.
 */
export const useUserListParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const status: UsersTab = pick(searchParams.get('status'), TABS) ?? ALL_OPTION;
  const statusFilter = status === ALL_OPTION ? pick(searchParams.get('statusFilter'), STATUSES) : undefined;
  // What the server filters on: the tab, or on the All tab its status select (absent: every status)
  const listStatus = status === ALL_OPTION ? statusFilter : status;
  const search = (searchParams.get('search') ?? '').trim();
  const role: UserRole | undefined = pick(searchParams.get('role'), ROLES);
  const verified = pick(searchParams.get('verified'), VERIFIED);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sort = pick(searchParams.get('sort'), USER_SORTS) ?? 'createdAt';
  const order = pick(searchParams.get('order'), SORT_ORDERS) ?? defaultSortOrder(sort);

  const params = useMemo<UsersListParams>(
    () => ({
      page,
      limit: USERS_PAGE_SIZE_DEFAULT,
      sort,
      order,
      ...(listStatus && { status: listStatus }),
      ...(search && { search }),
      ...(role && { role }),
      ...(verified && { verified: verified === 'true' }),
    }),
    [listStatus, page, sort, order, search, role, verified]
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
    (value: UsersTab) => update({ status: value === ALL_OPTION ? null : value, page: 1 }),
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
  const setStatusFilter = useCallback(
    (value: string) => update({ statusFilter: pick(value, STATUSES) ?? null, page: 1 }),
    [update]
  );
  const clearFilters = useCallback(
    () => update({ search: null, role: null, verified: null, statusFilter: null, page: 1 }),
    [update]
  );
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
    statusFilter: statusFilter ?? ALL_OPTION,
    search,
    role: role ?? ALL_OPTION,
    verified: verified ?? ALL_OPTION,
    page,
    sortPreset: `${sort}-${order}`,
    hasFilters: Boolean(search || role || verified || statusFilter),
    setStatus,
    setStatusFilter,
    setSearch,
    setRole,
    setVerified,
    clearFilters,
    setPage,
    setSortPreset,
  };
};
