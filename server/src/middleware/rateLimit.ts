import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000;

export const RATE_LIMITS = {
  login: 10,
  register: 10,
  forgotPassword: 5,
  resetPassword: 10,
  resendVerification: 10,
} as const;

export const createLimiter = (max: number, windowMs = WINDOW_MS) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Route tests fire many requests from one IP; the limiter itself has its own test.
    skip: () => env.NODE_ENV === 'test' && !process.env.FORCE_RATE_LIMIT,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      });
    },
  });

export const loginLimiter = createLimiter(RATE_LIMITS.login);
export const registerLimiter = createLimiter(RATE_LIMITS.register);
export const forgotPasswordLimiter = createLimiter(RATE_LIMITS.forgotPassword);
export const resetPasswordLimiter = createLimiter(RATE_LIMITS.resetPassword);
export const resendVerificationLimiter = createLimiter(RATE_LIMITS.resendVerification);
