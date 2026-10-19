import { Router } from 'express';
import { PERMISSIONS, movementsChartQuerySchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { movementsChart } from '../services/dashboard.js';

const router = Router();

// Receive vs ship per day or ISO week in the viewer's timezone (C26)
router.get('/movements-chart', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await movementsChart(movementsChartQuerySchema.parse(req.query)));
});

export default router;
