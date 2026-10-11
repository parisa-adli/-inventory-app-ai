import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ACCOUNT_STATUS, type DevMailResponse } from '@inventory/shared';
import { getApiError } from '@/lib/apiError';
import * as authApi from '../api/authApi';

export const authKeys = { me: ['auth', 'me'] as const };

/** Single source of truth for "who is logged in": data is the user, null when logged out. */
export const useAuthUser = () =>
  useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.fetchMe,
    retry: false,
  });

const onError = (err: unknown) => {
  toast.error(getApiError(err).message);
};

/** Success toast; outside production the mail is only logged, so offer the link it would have contained. */
const toastMailSent = (message: string, { devMailUrl }: DevMailResponse = {}) => {
  toast.success(message, {
    ...(devMailUrl
      ? { description: 'Dev mode: mail not sent.', action: { label: 'Open link', onClick: () => window.location.assign(devMailUrl) } }
      : {}),
  });
};

export const useLogin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      // The route guards react to this and redirect
      queryClient.setQueryData(authKeys.me, user);
      toast.success(user.status === ACCOUNT_STATUS.ACTIVE ? `Welcome back, ${user.name}` : 'Signed in');
    },
    onError,
  });
};

export const useRegister = () =>
  useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => toastMailSent('Account created. Check your email to verify your address.', data),
    onError,
  });

export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Nothing from this session may leak to the next user. Keep (not remove) the auth query:
      // mounted route guards observe it, and setting it to null is what sends them to /login.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== authKeys.me[0] });
      queryClient.setQueryData(authKeys.me, null);
      toast.success('Logged out');
    },
    onError,
  });
};

export const useVerifyEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.verifyEmail,
    onSuccess: () => {
      // A logged-in pending user's emailVerified flag or Telegram link just changed
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.success('Link confirmed');
    },
    // The page explains an expired or used link itself
    onError: () => {},
  });
};

export const useResendVerification = (onRateLimited?: (retryAfter: number) => void) =>
  useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: (data) => toastMailSent('Verification email sent', data),
    onError: (err) => {
      const { retryAfter } = getApiError(err);
      if (retryAfter) onRateLimited?.(retryAfter);
      onError(err);
    },
  });

export const useChangeEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.changeEmail,
    onSuccess: ({ user, devMailUrl }) => {
      queryClient.setQueryData(authKeys.me, user);
      toastMailSent(`Verification email sent to ${user.email}`, { devMailUrl });
    },
    // Field-level errors (duplicate email) are shown by the form
    onError: (err) => {
      const { code } = getApiError(err);
      if (code !== 'DUPLICATE_EMAIL') onError(err);
    },
  });
};

export const useForgotPassword = () =>
  useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: () => toast.success('If that account exists, a reset link is on its way'),
    onError,
  });

export const useResetPassword = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, { password }),
    onSuccess: () => {
      // The server revoked every session; drop the cached user so /login does not bounce back into the app
      queryClient.setQueryData(authKeys.me, null);
      toast.success('Password updated. Sign in with your new password.');
    },
    onError: (err) => {
      // The page explains an expired or used link itself
      const { code } = getApiError(err);
      if (code !== 'INVALID_TOKEN' && code !== 'TOKEN_EXPIRED') onError(err);
    },
  });
};
