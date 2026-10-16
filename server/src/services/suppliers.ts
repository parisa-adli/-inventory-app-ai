import type { Supplier as SupplierDto } from '@inventory/shared';
import { Supplier } from '../models/Supplier.js';
import { createCatalogService } from './catalog.js';

interface SupplierLike {
  _id: unknown;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// nameKey is never sent to the client
export const toSupplier = (doc: SupplierLike): SupplierDto => ({
  id: String(doc._id),
  name: doc.name,
  contactPerson: doc.contactPerson ?? null,
  phone: doc.phone ?? null,
  email: doc.email ?? null,
  address: doc.address ?? null,
  notes: doc.notes ?? null,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

export const suppliers = createCatalogService<SupplierLike, SupplierDto>({
  model: Supplier,
  nameField: 'name',
  searchFields: ['name', 'contactPerson', 'email'],
  productField: 'supplier',
  label: 'supplier',
  duplicateCode: 'DUPLICATE_SUPPLIER',
  inUseCode: 'SUPPLIER_IN_USE',
  toDto: toSupplier,
});
