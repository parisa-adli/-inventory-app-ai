import { sessionsResponseSchema } from '@inventory/shared';
import type {
  AuthUser,
  ChangePasswordInput,
  DeviceSession,
  SetPasswordInput,
  UpdateProfileInput,
} from '@inventory/shared';
import api from '@/lib/axios';
import type { TelegramAuthSession } from '@/features/auth/api/authApi';

// Profile self-service (CONTRACT-CHANGES C13). Every mutation answers the updated user.

const userOf = async (request: Promise<{ data: { user: AuthUser } }>) => (await request).data.user;

export const updateProfile = (input: UpdateProfileInput) => userOf(api.patch('/auth/me', input));

/** A Telegram-only account adds a password. */
export const setPassword = (input: SetPasswordInput) => userOf(api.post('/auth/password/set', input));

/** Signs every other browser out; this one gets a fresh session. */
export const changePassword = (input: ChangePasswordInput) => userOf(api.post('/auth/password', input));

export const removePassword = () => userOf(api.delete('/auth/password'));

export const unlinkTelegram = () => userOf(api.delete('/auth/telegram'));

/** Starts a LINK attempt; /auth/telegram/{status,resend,verify} then serve it like sign in. */
export const startTelegramLink = async (): Promise<TelegramAuthSession> => {
  const { data } = await api.post<TelegramAuthSession>('/auth/telegram/link');
  return data;
};

export const getSessions = async (): Promise<DeviceSession[]> => {
  const { data } = await api.get('/auth/sessions');
  return sessionsResponseSchema.parse(data).items;
};

/** Sign out everywhere, this browser included. */
export const signOutEverywhere = () => api.delete('/auth/sessions');
