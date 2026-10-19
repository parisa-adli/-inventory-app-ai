import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ACCOUNT_STATUS, PERMISSIONS, type AdminUser, type UsersPage } from '@inventory/shared';
import { useCan } from '@/features/auth/hooks/useCan';
import { getApiError } from '@/lib/apiError';
import * as usersApi from '../api/usersApi';
import { ROLE_LABELS } from '../roles';
import { USER_SORT_PRESETS } from './useUserListParams';

export const usersKeys = {
  all: ['users'] as const,
  lists: () => ['users', 'list'] as const,
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
 * When the total changes, the cached pending lists are invalidated too, so the Pending tab never
 * shows a count its rows disagree with.
 */
export const usePendingCount = () => {
  const canManage = useCan(PERMISSIONS.USERS_MANAGE);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: usersKeys.pendingCount(),
    queryFn: async () => {
      const startedAt = Date.now();
      const previous = queryClient.getQueryData<UsersPage>(usersKeys.pendingCount());
      const page = await usersApi.fetchUsers({
        status: ACCOUNT_STATUS.PENDING,
        page: 1,
        limit: 1,
        sort: USER_SORT_PRESETS[0].sort,
        order: USER_SORT_PRESETS[0].order,
      });
      if (previous && previous.total !== page.total) {
        // Skips lists already fetched since this count started (e.g. after a mutation invalidated both).
        // A list fetch still in flight is restarted: it may have begun before the change.
        void queryClient.invalidateQueries({
          queryKey: [...usersKeys.lists(), { status: ACCOUNT_STATUS.PENDING }],
          predicate: (query) => query.state.dataUpdatedAt < startedAt,
        });
      }
      return page;
    },
    select: (page) => page.total,
    enabled: canManage,
    staleTime: 0,
    refetchInterval: PENDING_COUNT_POLL_MS,
    refetchOnWindowFocus: true,
  });
};

const useStatusMutation = <TVariables = string>(
  mutationFn: (variables: TVariables) => Promise<AdminUser>,
  success: (user: AdminUser) => string
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (user) => {
      toast.success(success(user));
    },
    onError: (err) => {
      toast.error(getApiError(err).message);
    },
    // Also on error: a 409 means the list on screen was stale
    onSettled: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
};

export const useActivateUser = () => useStatusMutation(usersApi.activateUser, ({ name }) => `${name} was activated`);

export const useRejectUser = () => useStatusMutation(usersApi.rejectUser, ({ name }) => `${name} was rejected`);

export const useRevokeUser = () => useStatusMutation(usersApi.rejectUser, ({ name }) => `${name} was revoked`);

export const useReactivateUser = () =>
  useStatusMutation(usersApi.reactivateUser, ({ name }) => `${name} was reactivated`);

export const useChangeRole = () =>
  useStatusMutation(usersApi.changeUserRole, ({ name, role }) => `${name} is now ${ROLE_LABELS[role]}`);

export const useUnlinkTelegram = () =>
  useStatusMutation(usersApi.unlinkUserTelegram, ({ name }) => `Telegram was unlinked from ${name}'s account`);

/** The password comes back once and is shown in a dialog, so success has no toast. */
export const useIssueTemporaryPassword = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.issueTemporaryPassword,
    onError: (err) => {
      toast.error(getApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
};
