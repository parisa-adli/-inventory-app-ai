import { Router } from 'express';
import { PERMISSIONS, reconcileQuerySchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { reconcile } from '../services/stock.js';

const router = Router();

// A GET that writes when fix=true: a known wording conflict, accepted in the #27 Q&A (CONTRACT-CHANGES C22)
router.get('/reconcile', ...can(PERMISSIONS.STOCK_RECONCILE), async (req, res) => {
  res.json(await reconcile(reconcileQuerySchema.parse(req.query)));
});

export default router;
