import { Router } from 'express';
import { env } from '../config/env.js';
import { TELEGRAM_WEBHOOK_PATH, isTelegramConfigured, telegramWebhookHandler } from '../services/telegram.js';
import authRouter from './auth.js';
import categoriesRouter from './categories.js';
import healthRouter from './health.js';
import productsRouter from './products.js';
import stockMovementsRouter from './stockMovements.js';
import suppliersRouter from './suppliers.js';
import usersRouter from './users.js';

const router = Router();

router.use('/api', healthRouter);
router.use('/api/auth', authRouter);
router.use('/api/users', usersRouter);
router.use('/api/categories', categoriesRouter);
router.use('/api/suppliers', suppliersRouter);
router.use('/api/products', productsRouter);
router.use('/api/stock-movements', stockMovementsRouter);

// Telegram pushes updates here in webhook mode only; polling needs no inbound route.
// grammY rejects requests whose secret_token header does not match TELEGRAM_WEBHOOK_SECRET.
if (env.TELEGRAM_MODE === 'webhook' && isTelegramConfigured()) {
  router.post(TELEGRAM_WEBHOOK_PATH, telegramWebhookHandler());
}

export default router;
