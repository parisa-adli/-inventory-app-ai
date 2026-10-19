import type { AccountStatus, UserRole } from '@inventory/shared';

/** How each role reads in the Users list and its filter. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
};

/** How each account status reads in the All tab's badges and status filter. */
export const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  rejected: 'Rejected',
};
