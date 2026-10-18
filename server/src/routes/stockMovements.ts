import { Router } from 'express';
import { PERMISSIONS, createStockMovementSchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { recordMovement } from '../services/stock.js';
import { presentMovement } from '../services/stockMovements.js';

const router = Router();

// Replaces the PRD's PATCH /products/:id/quantity and POST /products/:id/adjust-stock (C19)
router.post('/', ...can(PERMISSIONS.STOCK_ADJUST), validate(createStockMovementSchema), async (req, res) => {
  const movement = await recordMovement({ ...req.body, userId: req.user!.id });
  res.status(201).json(await presentMovement(movement));
});

export default router;
