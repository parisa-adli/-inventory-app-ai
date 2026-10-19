import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import type { Settings } from '@inventory/shared';
import api from './axios';

export const settingsKeys = { all: ['settings'] as const };

export const fetchSettings = async (): Promise<Settings> => {
  const { data } = await api.get<Settings>('/settings');
  return data;
};

/** The app-wide settings (C25). `requireSignedIn` loads them with `/auth/me`, before any app page renders. */
export const settingsQuery = queryOptions({ queryKey: settingsKeys.all, queryFn: fetchSettings });

/**
 * The stored threshold and currency. Never undefined: the shell's guard has them cached before a page renders, so
 * nothing shows money or a stock badge with a guessed value (there is no USD fallback).
 */
export const useSettings = () => useSuspenseQuery(settingsQuery).data;
