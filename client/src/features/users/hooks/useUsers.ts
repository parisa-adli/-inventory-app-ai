import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ACCOUNT_STATUS, PERMISSIONS } from '@inventory/shared';
import { useCan } from '@/features/auth/hooks/useCan';
import { getApiError } from '@/lib/apiError';
import * as usersApi from '../api/usersApi';
import { USER_SORT_PRESETS } from './useUserListParams';

export const usersKeys = {
  all: ['users'] as const,
  list: (params: usersApi.UsersListParams) => ['users', 'list', params] as const,
  pendingCount: () => ['users', 'pending-count'] as const,
};

export const useUsers = (params: usersApi.UsersListParams) =>
  useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => usersApi.fetchUsers(params),
    placeholderData: keepPreviousData,
  });

const PENDING_COUNT_POLL_MS = 60 * 1000;

/**
 * Accounts awaiting approval, for the nav and Pending-tab badges: the pending list with page size 1,
 * read for its `total`. Ignores the Users page filters; under `usersKeys.all`, so every user mutation
 * refreshes it. Polls every minute and on window focus. Sends nothing without `USERS_MANAGE`.
 */
export const usePendingCount = () => {
  const canManage = useCan(PERMISSIONS.USERS_MANAGE);
  return useQuery({
    queryKey: usersKeys.pendingCount(),
    queryFn: () =>
      usersApi.fetchUsers({
        status: ACCOUNT_STATUS.PENDING,
        page: 1,
        limit: 1,
        sort: USER_SORT_PRESETS[0].sort,
        order: USER_SORT_PRESETS[0].order,
      }),
    select: (page) => page.total,
    enabled: canManage,
    staleTime: 0,
    refetchInterval: PENDING_COUNT_POLL_MS,
    refetchOnWindowFocus: true,
  });
};

const useStatusMutation = (
  mutationFn: (id: string) => Promise<{ name: string }>,
  success: (name: string) => string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (user) => {
      toast.success(success(user.name));
    },
    onError: (err) => {
      toast.error(getApiError(err).message);
    },
    // Also on error: a 409 means the list on screen was stale
    onSettled: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
};

export const useActivateUser = () => useStatusMutation(usersApi.activateUser, (name) => `${name} was activated`);

export const useRejectUser = () => useStatusMutation(usersApi.rejectUser, (name) => `${name} was rejected`);

export const useRevokeUser = () => useStatusMutation(usersApi.rejectUser, (name) => `${name} was revoked`);

export const useReactivateUser = () =>
  useStatusMutation(usersApi.reactivateUser, (name) => `${name} was reactivated`);
