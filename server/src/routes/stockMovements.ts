import { Router } from 'express';
import {
  PERMISSIONS,
  createStockMovementSchema,
  listStockMovementsQuerySchema,
  stockMovementsFilterSchema,
} from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { recordMovement } from '../services/stock.js';
import { listMovementUsers, listMovements, presentMovement, summarizeMovements } from '../services/stockMovements.js';

const router = Router();

// Also the Stock History dialog's source (`?product=`); replaces GET /api/products/:id/stock-movements (C19)
router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await listMovements(listStockMovementsQuerySchema.parse(req.query)));
});

// The Stock Movements page's cards: the same filters as the list
router.get('/summary', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await summarizeMovements(stockMovementsFilterSchema.parse(req.query)));
});

// The page's "By" filter
router.get('/users', ...can(PERMISSIONS.INVENTORY_VIEW), async (_req, res) => {
  res.json(await listMovementUsers());
});

// Replaces the PRD's PATCH /products/:id/quantity and POST /products/:id/adjust-stock (C19)
router.post('/', ...can(PERMISSIONS.STOCK_ADJUST), validate(createStockMovementSchema), async (req, res) => {
  const movement = await recordMovement({ ...req.body, userId: req.user!.id });
  res.status(201).json(await presentMovement(movement));
});

export default router;
