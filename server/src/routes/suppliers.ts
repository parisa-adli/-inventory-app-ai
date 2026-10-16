import { PERMISSIONS, createSupplierSchema, updateSupplierSchema } from '@inventory/shared';
import { suppliers } from '../services/suppliers.js';
import { catalogRouter } from './catalogRouter.js';

export default catalogRouter({
  service: suppliers,
  managePermission: PERMISSIONS.SUPPLIERS_MANAGE,
  createSchema: createSupplierSchema,
  updateSchema: updateSupplierSchema,
});
