import { Router } from 'express';
import {
  PERMISSIONS,
  assignSupplierSchema,
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { assignSupplier, createProduct, deleteProduct, listProducts, setArchived, updateProduct } from '../services/products.js';

const router = Router();

router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await listProducts(listProductsQuerySchema.parse(req.query)));
});

router.post('/', ...can(PERMISSIONS.PRODUCTS_WRITE), validate(createProductSchema), async (req, res) => {
  res.status(201).json(await createProduct(req.body));
});

// Before '/:id', which would otherwise take "supplier" as an id
router.patch('/supplier', ...can(PERMISSIONS.PRODUCTS_WRITE), validate(assignSupplierSchema), async (req, res) => {
  res.json(await assignSupplier(req.body));
});

router.patch('/:id', ...can(PERMISSIONS.PRODUCTS_WRITE), validate(updateProductSchema), async (req, res) => {
  res.json(await updateProduct(String(req.params.id), req.body));
});

router.patch('/:id/archive', ...can(PERMISSIONS.PRODUCTS_ARCHIVE), async (req, res) => {
  res.json(await setArchived(String(req.params.id), true));
});

router.patch('/:id/unarchive', ...can(PERMISSIONS.PRODUCTS_ARCHIVE), async (req, res) => {
  res.json(await setArchived(String(req.params.id), false));
});

router.delete('/:id', ...can(PERMISSIONS.PRODUCTS_DELETE), async (req, res) => {
  await deleteProduct(String(req.params.id));
  res.status(204).end();
});

export default router;
