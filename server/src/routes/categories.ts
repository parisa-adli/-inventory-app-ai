import { PERMISSIONS, createCategorySchema, updateCategorySchema } from '@inventory/shared';
import { categories } from '../services/categories.js';
import { catalogRouter } from './catalogRouter.js';

export default catalogRouter({
  service: categories,
  managePermission: PERMISSIONS.CATEGORIES_MANAGE,
  createSchema: createCategorySchema,
  updateSchema: updateCategorySchema,
});
