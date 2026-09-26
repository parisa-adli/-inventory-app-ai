export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const ROLE_HIERARCHY = {
  [USER_ROLES.ADMIN]: 3,
  [USER_ROLES.MANAGER]: 2,
  [USER_ROLES.STAFF]: 1,
} as const;
