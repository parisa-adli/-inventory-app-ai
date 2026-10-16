import type { CreateSupplierInput, Supplier, SupplierListItem, UpdateSupplierInput } from '@inventory/shared';
import { createCatalogHooks } from '@/features/catalog/hooks/createCatalogHooks';

const hooks = createCatalogHooks<Supplier, SupplierListItem, CreateSupplierInput, UpdateSupplierInput>({
  resource: 'suppliers',
  nameOf: (supplier) => supplier.name,
});

export const suppliersKeys = hooks.keys;
/** Paginated list. Product selects (P3) call it with `{ limit: 100, sort: 'name' }`. */
export const useSuppliers = hooks.useList;
export const useCreateSupplier = hooks.useCreate;
export const useUpdateSupplier = hooks.useUpdate;
export const useDeleteSupplier = hooks.useDelete;
