import { isAxiosError } from 'axios';
import type {
  AuthUser,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@inventory/shared';
import api from '@/lib/axios';

/** The current user, or null when there is no (valid) session. */
export const fetchMe = async (): Promise<AuthUser | null> => {
  try {
    const { data } = await api.get<AuthUser>('/auth/me');
    return data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 401) return null;
    throw err;
  }
};

export const login = async (input: LoginInput): Promise<AuthUser> => {
  const { data } = await api.post<{ user: AuthUser }>('/auth/login', input);
  return data.user;
};

export const register = (input: RegisterInput) => api.post('/auth/register', input);

export const logout = () => api.post('/auth/logout');

export const verifyEmail = (token: string) => api.get(`/auth/verify-email/${encodeURIComponent(token)}`);

export const resendVerification = () => api.post('/auth/resend-verification');

export const forgotPassword = (input: ForgotPasswordInput) => api.post('/auth/forgot-password', input);

export const resetPassword = (token: string, input: ResetPasswordInput) =>
  api.post(`/auth/reset-password/${encodeURIComponent(token)}`, input);
