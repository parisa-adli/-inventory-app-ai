import type { Category as CategoryDto } from '@inventory/shared';
import { Category } from '../models/Category.js';
import { createCatalogService } from './catalog.js';

interface CategoryLike {
  _id: unknown;
  title: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// titleKey is never sent to the client
export const toCategory = (doc: CategoryLike): CategoryDto => ({
  id: String(doc._id),
  title: doc.title,
  description: doc.description ?? null,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

export const categories = createCatalogService<CategoryLike, CategoryDto>({
  model: Category,
  nameField: 'title',
  searchFields: ['title', 'description'],
  productField: 'category',
  label: 'category',
  duplicateCode: 'DUPLICATE_CATEGORY',
  inUseCode: 'CATEGORY_IN_USE',
  toDto: toCategory,
});
