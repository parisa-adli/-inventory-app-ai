import { Router } from 'express';
import healthRouter from './health.js';

const router = Router();

router.use('/api', healthRouter);

export default router;
