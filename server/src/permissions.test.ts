import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, type Permission } from '@inventory/shared';

// PRD §2 permission matrix, row by row. Changing who may do what means changing this table on purpose.
const MATRIX: [Permission, { staff: boolean; admin: boolean }][] = [
  [PERMISSIONS.INVENTORY_VIEW, { staff: true, admin: true }],
  [PERMISSIONS.PRODUCTS_WRITE, { staff: true, admin: true }],
  [PERMISSIONS.STOCK_ADJUST, { staff: true, admin: true }],
  [PERMISSIONS.STOCK_RECONCILE, { staff: false, admin: true }],
  [PERMISSIONS.PRODUCTS_ARCHIVE, { staff: false, admin: true }],
  [PERMISSIONS.PRODUCTS_DELETE, { staff: false, admin: true }],
  [PERMISSIONS.CATEGORIES_WRITE, { staff: true, admin: true }],
  [PERMISSIONS.CATEGORIES_DELETE, { staff: false, admin: true }],
  [PERMISSIONS.SUPPLIERS_WRITE, { staff: true, admin: true }],
  [PERMISSIONS.SUPPLIERS_DELETE, { staff: false, admin: true }],
  [PERMISSIONS.USERS_MANAGE, { staff: false, admin: true }],
  // C25: not in the PRD's matrix
  [PERMISSIONS.SETTINGS_EDIT, { staff: false, admin: true }],
];

describe('role permissions (PRD §2)', () => {
  it.each(MATRIX)('%s', (permission, expected) => {
    expect({ staff: hasPermission('staff', permission), admin: hasPermission('admin', permission) }).toEqual(expected);
  });

  it('covers every permission', () => {
    expect(MATRIX.map(([permission]) => permission).sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  it('grants nothing outside the permission list', () => {
    const known = new Set<string>(Object.values(PERMISSIONS));
    for (const granted of Object.values(ROLE_PERMISSIONS)) {
      expect(granted.every((permission) => known.has(permission))).toBe(true);
    }
  });
});
