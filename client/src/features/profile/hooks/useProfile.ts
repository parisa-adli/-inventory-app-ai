import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AuthUser } from '@inventory/shared';
import { getApiError } from '@/lib/apiError';
import { authKeys, useEndedSession } from '@/features/auth/hooks/useAuth';
import * as profileApi from '../api/profileApi';

// Not under 'auth': signing out removes every query except /me, and the session list must go with them
export const profileKeys = { sessions: ['profile', 'sessions'] as const };

const onError = (err: unknown) => {
  toast.error(getApiError(err).message);
};

export const useSessions = () => useQuery({ queryKey: profileKeys.sessions, queryFn: profileApi.getSessions });

/** A mutation that answers the updated user: cache it (the whole app reads /me) and toast. */
const useUserMutation = <Input>(
  mutationFn: (input: Input) => Promise<AuthUser>,
  success: string,
  invalidate?: readonly unknown[]
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user);
      if (invalidate) void queryClient.invalidateQueries({ queryKey: invalidate });
      toast.success(success);
    },
    onError,
  });
};

export const useUpdateProfile = () => useUserMutation(profileApi.updateProfile, 'Display name saved');
export const useSetPassword = () => useUserMutation(profileApi.setPassword, 'Password added');
export const useRemovePassword = () => useUserMutation(profileApi.removePassword, 'Password removed');
export const useUnlinkTelegram = () => useUserMutation(profileApi.unlinkTelegram, 'Telegram unlinked');

// Every other browser was signed out, so the session list changed too
export const useChangePassword = () =>
  useUserMutation(profileApi.changePassword, 'Password changed. Other devices were signed out.', profileKeys.sessions);

/** Called by the link dialog once the code is verified. */
export const useTelegramLinked = () => {
  const queryClient = useQueryClient();
  return (user: AuthUser) => {
    queryClient.setQueryData(authKeys.me, user);
    toast.success('Telegram linked');
  };
};

export const useSignOutEverywhere = () => {
  const ended = useEndedSession();
  return useMutation({
    mutationFn: profileApi.signOutEverywhere,
    onSuccess: () => {
      ended();
      toast.success('Signed out everywhere');
    },
    onError,
  });
};
