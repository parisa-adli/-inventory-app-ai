import { Router } from 'express';
import { PERMISSIONS, dashboardRangeQuerySchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { dashboardAlerts, dashboardPeriodSummary, dashboardSummary, movementsChart } from '../services/dashboard.js';

const router = Router();

// The "Right now" cards, active products only (C26)
router.get('/summary', ...can(PERMISSIONS.INVENTORY_VIEW), async (_req, res) => {
  res.json(await dashboardSummary());
});

// Out and low active products to reorder, at most 5, with the full count (C26)
router.get('/alerts', ...can(PERMISSIONS.INVENTORY_VIEW), async (_req, res) => {
  res.json(await dashboardAlerts());
});

// Money in and out over the dashboard's range, in the viewer's timezone
router.get('/period-summary', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await dashboardPeriodSummary(dashboardRangeQuerySchema.parse(req.query)));
});

// Receive vs ship (units and value) per hour, day, week or month in the viewer's timezone (C26)
router.get('/movements-chart', ...can(PERMISSIONS.INVENTORY_VIEW), async (req, res) => {
  res.json(await movementsChart(dashboardRangeQuerySchema.parse(req.query)));
});

export default router;
