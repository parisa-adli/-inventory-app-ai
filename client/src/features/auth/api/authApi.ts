import { isAxiosError } from 'axios';
import type {
  AuthUser,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  TelegramCompleteInput,
  TelegramVerifyInput,
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

/** A Telegram sign in / sign up attempt: `deepLink` goes into the QR code; the session id stays in an httpOnly cookie. */
export interface TelegramAuthSession {
  deepLink: string;
  /** ISO timestamp. */
  expiresAt: string;
}

export type TelegramAuthStatus = 'PENDING' | 'AWAITING_OTP' | 'AWAITING_PROFILE' | 'COMPLETED' | 'EXPIRED' | 'LOCKED';

export interface TelegramStatusView {
  status: TelegramAuthStatus;
  expiresAt?: string;
  otpExpiresAt?: string;
  /** When "Resend code" is available again; null once the resend limit is used. */
  resendAvailableAt?: string | null;
  prefillDisplayName?: string;
}

export type TelegramVerifyResult =
  | { status: 'COMPLETED'; user: AuthUser }
  | { status: 'AWAITING_PROFILE'; prefillDisplayName?: string };

export interface TelegramResendResult {
  otpExpiresAt: string;
  resendAvailableAt: string | null;
}

export type TelegramCompleteResult =
  | { status: 'COMPLETED'; outcome: 'created'; user: AuthUser }
  | { status: 'COMPLETED'; outcome: 'link-sent' | 'already-linked' };

export const startTelegramAuth = async (): Promise<TelegramAuthSession> => {
  const { data } = await api.post<TelegramAuthSession>('/auth/telegram/start');
  return data;
};

export const getTelegramStatus = async (): Promise<TelegramStatusView> => {
  const { data } = await api.get<TelegramStatusView>('/auth/telegram/status');
  return data;
};

export const verifyTelegramCode = async (input: TelegramVerifyInput): Promise<TelegramVerifyResult> => {
  const { data } = await api.post<TelegramVerifyResult>('/auth/telegram/verify', input);
  return data;
};

export const resendTelegramCode = async (): Promise<TelegramResendResult> => {
  const { data } = await api.post<TelegramResendResult>('/auth/telegram/resend');
  return data;
};

export const completeTelegramSignup = async (input: TelegramCompleteInput): Promise<TelegramCompleteResult> => {
  const { data } = await api.post<TelegramCompleteResult>('/auth/telegram/complete', input);
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
