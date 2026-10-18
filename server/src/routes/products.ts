import { Router } from 'express';
import { PERMISSIONS, createProductSchema, listProductsQuerySchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { createProduct, listProducts } from '../services/products.js';

const router = Router();

router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await listProducts(listProductsQuerySchema.parse(req.query)));
});

router.post('/', ...can(PERMISSIONS.PRODUCTS_WRITE), validate(createProductSchema), async (req, res) => {
  res.status(201).json(await createProduct(req.body));
});

export default router;
