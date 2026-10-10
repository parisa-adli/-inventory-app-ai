import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

export const useLogin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      // The route guards react to this and redirect
      queryClient.setQueryData(authKeys.me, user);
      toast.success(`Welcome back, ${user.name}`);
    },
    onError,
  });
};

export const useRegister = () =>
  useMutation({
    mutationFn: authApi.register,
    onSuccess: () => toast.success('Account created. Check your email to verify your address.'),
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
    onSuccess: ({ type }) => {
      // A logged-in pending user's emailVerified flag or Telegram link just changed
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.success(type === 'link-telegram' ? 'Telegram linked' : 'Email verified');
    },
    onError,
  });
};

export const useResendVerification = () =>
  useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success('Verification email sent'),
    onError,
  });

export const useForgotPassword = () =>
  useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: () => toast.success('If that account exists, a reset link is on its way'),
    onError,
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, { password }),
    onSuccess: () => toast.success('Password updated. Please log in.'),
    onError,
  });
