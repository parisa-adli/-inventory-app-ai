import type { AccountStatus, AdminUser, SortOrder, UserRole, UserSort, UsersPage } from '@inventory/shared';
import api from '@/lib/axios';

export interface UsersListParams {
  status: AccountStatus;
  page: number;
  limit: number;
  sort: UserSort;
  order: SortOrder;
  search?: string;
  role?: UserRole;
  verified?: boolean;
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

export const reactivateUser = async (id: string): Promise<AdminUser> => {
  const { data } = await api.patch<AdminUser>(`/users/${id}/reactivate`);
  return data;
};
