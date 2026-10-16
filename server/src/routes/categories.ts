import { PERMISSIONS, createCategorySchema, updateCategorySchema } from '@inventory/shared';
import { categories } from '../services/categories.js';
import { catalogRouter } from './catalogRouter.js';

export default catalogRouter({
  service: categories,
  writePermission: PERMISSIONS.CATEGORIES_WRITE,
  deletePermission: PERMISSIONS.CATEGORIES_DELETE,
  createSchema: createCategorySchema,
  updateSchema: updateCategorySchema,
});
