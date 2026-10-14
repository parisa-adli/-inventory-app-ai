import { hasPermission, type Permission } from '@inventory/shared';
import { useAuthUser } from './useAuth';

/**
 * Whether the signed-in user's role grants `permission` (ROLE_PERMISSIONS in @inventory/shared).
 * False while loading and for a guest. UX only: the server's `can(...)` guard is the real boundary.
 */
export const useCan = (permission: Permission): boolean => {
  const { data: user } = useAuthUser();
  return user ? hasPermission(user.role, permission) : false;
};
