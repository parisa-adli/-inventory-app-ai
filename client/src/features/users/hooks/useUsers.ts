import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiError } from '@/lib/apiError';
import * as usersApi from '../api/usersApi';

export const usersKeys = {
  all: ['users'] as const,
  list: (params: usersApi.UsersListParams) => ['users', 'list', params] as const,
};

export const useUsers = (params: usersApi.UsersListParams) =>
  useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => usersApi.fetchUsers(params),
    placeholderData: keepPreviousData,
  });

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
