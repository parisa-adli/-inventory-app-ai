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

/** A QR login attempt: `deepLink` goes into the QR code, `pollToken` stays in this browser. */
export interface TelegramLoginSession {
  deepLink: string;
  pollToken: string;
  /** ISO timestamp. */
  expiresAt: string;
}

export type TelegramLoginPoll =
  | { status: 'pending' | 'unlinked' | 'expired' }
  | { status: 'approved'; user: AuthUser };

export const startTelegramLogin = async (): Promise<TelegramLoginSession> => {
  const { data } = await api.post<TelegramLoginSession>('/auth/telegram/login');
  return data;
};

export const pollTelegramLogin = async (pollToken: string): Promise<TelegramLoginPoll> => {
  const { data } = await api.post<TelegramLoginPoll>('/auth/telegram/login/poll', { pollToken });
  return data;
};

/** What a consumed emailed link did: confirmed the email, or linked a Telegram chat. */
export type EmailLinkType = 'verify-email' | 'link-telegram';

export const verifyEmail = async (token: string): Promise<{ type: EmailLinkType }> => {
  const { data } = await api.get<{ type: EmailLinkType }>(`/auth/verify-email/${encodeURIComponent(token)}`);
  return data;
};

export const resendVerification = () => api.post('/auth/resend-verification');

export const forgotPassword = (input: ForgotPasswordInput) => api.post('/auth/forgot-password', input);

export const resetPassword = (token: string, input: ResetPasswordInput) =>
  api.post(`/auth/reset-password/${encodeURIComponent(token)}`, input);
