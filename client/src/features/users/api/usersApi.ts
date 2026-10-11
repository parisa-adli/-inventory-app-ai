import type { AccountStatus, AdminUser, UsersPage } from '@inventory/shared';
import api from '@/lib/axios';

export interface UsersListParams {
  status: AccountStatus;
  page: number;
  limit: number;
}

export const fetchUsers = async (params: UsersListParams): Promise<UsersPage> => {
  const { data } = await api.get<UsersPage>('/users', { params });
  return data;
};

export const activateUser = async (id: string): Promise<AdminUser> => {
  const { data } = await api.patch<AdminUser>(`/users/${id}/activate`);
  return data;
};

export const rejectUser = async (id: string): Promise<AdminUser> => {
  const { data } = await api.patch<AdminUser>(`/users/${id}/reject`);
  return data;
};
