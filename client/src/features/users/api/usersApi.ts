import type {
  AccountStatus,
  AdminUser,
  SortOrder,
  TempPasswordResponse,
  UserRole,
  UserSort,
  UsersPage,
} from '@inventory/shared';
import api from '@/lib/axios';

export interface UsersListParams {
  /** Left out for every status (the All tab). */
  status?: AccountStatus;
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

export const changeUserRole = async ({ id, role }: { id: string; role: UserRole }): Promise<AdminUser> => {
  const { data } = await api.patch<AdminUser>(`/users/${id}`, { role });
  return data;
};

export const issueTemporaryPassword = async (id: string): Promise<TempPasswordResponse> => {
  const { data } = await api.post<TempPasswordResponse>(`/users/${id}/password/temp`);
  return data;
};

export const unlinkUserTelegram = async (id: string): Promise<AdminUser> => {
  const { data } = await api.delete<AdminUser>(`/users/${id}/credentials/telegram`);
  return data;
};
