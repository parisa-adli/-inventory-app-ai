import { Router } from 'express';
import { PERMISSIONS, updateSettingsSchema } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { getSettings, updateSettings } from '../services/settings.js';

const router = Router();

// Every active user reads the settings: staff need the threshold for badges and the currency for money (C25)
router.get('/', ...can(PERMISSIONS.INVENTORY_VIEW), async (_req, res) => {
  res.json(await getSettings());
});

router.patch('/', ...can(PERMISSIONS.SETTINGS_EDIT), validate(updateSettingsSchema), async (req, res) => {
  res.json(await updateSettings(req.body, req.user!.id));
});

export default router;
