import type { Category, CategoryListItem, CreateCategoryInput, UpdateCategoryInput } from '@inventory/shared';
import { createCatalogHooks } from '@/features/catalog/hooks/createCatalogHooks';

const hooks = createCatalogHooks<Category, CategoryListItem, CreateCategoryInput, UpdateCategoryInput>({
  resource: 'categories',
  nameOf: (category) => category.title,
});

export const categoriesKeys = hooks.keys;
/** Paginated list. Product selects (P3) call it with `{ limit: 100, sort: 'name' }`. */
export const useCategories = hooks.useList;
export const useCreateCategory = hooks.useCreate;
export const useUpdateCategory = hooks.useUpdate;
export const useDeleteCategory = hooks.useDelete;
