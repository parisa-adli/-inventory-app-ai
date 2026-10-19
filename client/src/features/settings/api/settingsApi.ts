import type { Settings, UpdateSettingsInput } from '@inventory/shared';
import api from '@/lib/axios';

/** Answers the saved settings, in the GET shape. */
export const updateSettings = async (body: UpdateSettingsInput): Promise<Settings> => {
  const { data } = await api.patch<Settings>('/settings', body);
  return data;
};
