import { Router } from 'express';
import { PERMISSIONS, createStockMovementSchema, listStockMovementsQuerySchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { recordMovement } from '../services/stock.js';
import { listMovements, presentMovement } from '../services/stockMovements.js';

const router = Router();

// Also the Stock History dialog's source (`?product=`); replaces GET /api/products/:id/stock-movements (C19)
router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await listMovements(listStockMovementsQuerySchema.parse(req.query)));
});

// Replaces the PRD's PATCH /products/:id/quantity and POST /products/:id/adjust-stock (C19)
router.post('/', ...can(PERMISSIONS.STOCK_ADJUST), validate(createStockMovementSchema), async (req, res) => {
  const movement = await recordMovement({ ...req.body, userId: req.user!.id });
  res.status(201).json(await presentMovement(movement));
});

export default router;
