import { USER_ROLES, type UserRole } from './roles';

/**
 * Every action the app guards, one per row of the PRD §2 permission matrix. Server routes check these
 * (`can(...)` in server/src/middleware/guards.ts) and the client hides UI with them (`useCan`, `<Can>`).
 * A new guarded action gets a permission here first, then its role assignment below.
 */
export const PERMISSIONS = {
  /** View products, categories, suppliers, stock movements and the dashboard. */
  INVENTORY_VIEW: 'inventory.view',
  /** Create and edit products, including assigning an existing supplier. */
  PRODUCTS_WRITE: 'products.write',
  /** Receive, ship and manual adjustment, including the inline +/- buttons. */
  STOCK_ADJUST: 'stock.adjust',
  /** Compare every product's quantity with its movement history and, on request, repair mismatches. */
  STOCK_RECONCILE: 'stock.reconcile',
  PRODUCTS_ARCHIVE: 'products.archive',
  PRODUCTS_DELETE: 'products.delete',
  /** Create and edit categories. */
  CATEGORIES_WRITE: 'categories.write',
  CATEGORIES_DELETE: 'categories.delete',
  /** Create and edit suppliers. */
  SUPPLIERS_WRITE: 'suppliers.write',
  SUPPLIERS_DELETE: 'suppliers.delete',
  /** Activate, reject, revoke and reinstate users, change roles, temporary passwords, credentials. */
  USERS_MANAGE: 'users.manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const STAFF_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.PRODUCTS_WRITE,
  PERMISSIONS.STOCK_ADJUST,
  PERMISSIONS.CATEGORIES_WRITE,
  PERMISSIONS.SUPPLIERS_WRITE,
];

/** Fixed in code (not stored in the DB): typed by role, so a new role cannot be added without its list. */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [USER_ROLES.STAFF]: STAFF_PERMISSIONS,
  [USER_ROLES.ADMIN]: Object.values(PERMISSIONS),
};

export const hasPermission = (role: UserRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);
