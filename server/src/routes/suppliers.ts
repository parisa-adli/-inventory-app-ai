import { PERMISSIONS, createSupplierSchema, updateSupplierSchema } from '@inventory/shared';
import { suppliers } from '../services/suppliers.js';
import { catalogRouter } from './catalogRouter.js';

export default catalogRouter({
  service: suppliers,
  writePermission: PERMISSIONS.SUPPLIERS_WRITE,
  deletePermission: PERMISSIONS.SUPPLIERS_DELETE,
  createSchema: createSupplierSchema,
  updateSchema: updateSupplierSchema,
});
