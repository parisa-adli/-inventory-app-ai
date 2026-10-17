import type { UserRole } from '@inventory/shared';

/** How each role reads in the Users list and its filter. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
};
