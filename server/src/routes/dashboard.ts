import { Router } from 'express';
import { PERMISSIONS, movementsChartQuerySchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { dashboardAlerts, dashboardSummary, movementsChart } from '../services/dashboard.js';

const router = Router();

// The five stat cards, active products only (C26)
router.get('/summary', ...can(PERMISSIONS.INVENTORY_VIEW), async (_req, res) => {
  res.json(await dashboardSummary());
});

// Out and low active products to reorder, at most 20, with the full count (C26)
router.get('/alerts', ...can(PERMISSIONS.INVENTORY_VIEW), async (_req, res) => {
  res.json(await dashboardAlerts());
});

// Receive vs ship per day or ISO week in the viewer's timezone (C26)
router.get('/movements-chart', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await movementsChart(movementsChartQuerySchema.parse(req.query)));
});

export default router;
