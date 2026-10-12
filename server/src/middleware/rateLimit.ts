import type { Request, RequestHandler } from 'express';
import expressRateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { RateLimitHit } from '../models/RateLimitHit.js';
import { sha256 } from '../utils/crypto.js';

const WINDOW_MS = 15 * 60 * 1000;

export const RATE_LIMITS = {
  login: 10,
  register: 10,
  resetPassword: 10,
  telegramStart: 10,
  // The browser polls status every 2 s while the QR code is shown (5 min = ~150 requests)
  telegramStatus: 600,
  // Per IP, on top of the per-session attempt caps
  telegramVerify: 30,
  telegramResend: 10,
  telegramComplete: 10,
} as const;

// Route tests fire many requests from one IP; the limiters have their own tests (FORCE_RATE_LIMIT).
// Read per request so a test can flip env.FORCE_RATE_LIMIT.
const bypassed = () => env.NODE_ENV === 'test' && !env.FORCE_RATE_LIMIT;

export const createLimiter = (max: number, windowMs = WINDOW_MS) =>
  expressRateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: bypassed,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      });
    },
  });

export const loginLimiter = createLimiter(RATE_LIMITS.login);
export const registerLimiter = createLimiter(RATE_LIMITS.register);
export const resetPasswordLimiter = createLimiter(RATE_LIMITS.resetPassword);
export const telegramStartLimiter = createLimiter(RATE_LIMITS.telegramStart);
export const telegramStatusLimiter = createLimiter(RATE_LIMITS.telegramStatus);
export const telegramVerifyLimiter = createLimiter(RATE_LIMITS.telegramVerify);
export const telegramResendLimiter = createLimiter(RATE_LIMITS.telegramResend);
export const telegramCompleteLimiter = createLimiter(RATE_LIMITS.telegramComplete);

interface MongoRateLimitOptions {
  /** Identifies who is being limited, e.g. `forgot:ip:1.2.3.4`. Hash anything personal. */
  key: (req: Request) => string;
  limit: number;
  windowMs: number;
}

const RATE_LIMITED_MESSAGE = 'Too many requests. Please try again later.';

/**
 * Fixed-window counter kept in Mongo, so limits survive restarts and are shared between instances.
 * Over the limit it answers 429 RATE_LIMITED with `details.retryAfter` (seconds) and a Retry-After header.
 * Put it before any lookup so a real and an unknown email are limited (and answered) identically.
 */
export const rateLimit = ({ key, limit, windowMs }: MongoRateLimitOptions): RequestHandler => {
  const hit = async (id: string, windowEnd: Date) => {
    const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: windowEnd } };
    try {
      return await RateLimitHit.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true });
    } catch (err) {
      // Two first requests of a window can race on the upsert; the loser just increments
      if ((err as { code?: number }).code !== 11000) throw err;
      return RateLimitHit.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true });
    }
  };

  return async (req, res, next) => {
    if (bypassed()) return next();

    try {
      const now = Date.now();
      const window = Math.floor(now / windowMs);
      const windowEnd = new Date((window + 1) * windowMs);
      const counter = await hit(`${key(req)}:${window}`, windowEnd);

      if (counter && counter.count > limit) {
        const retryAfter = Math.max(1, Math.ceil((windowEnd.getTime() - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE, details: { retryAfter } },
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

const HOUR_MS = 60 * 60 * 1000;
const clientIp = (req: Request) => req.ip ?? 'unknown';
const emailKey = (req: Request) => sha256(String(req.body?.email ?? '').toLowerCase());

/** Password reset requests: 5 per IP and 3 per email per hour. */
export const forgotPasswordIpLimiter = rateLimit({
  key: (req) => `forgot:ip:${clientIp(req)}`,
  limit: 5,
  windowMs: HOUR_MS,
});
export const forgotPasswordEmailLimiter = rateLimit({
  key: (req) => `forgot:email:${emailKey(req)}`,
  limit: 3,
  windowMs: HOUR_MS,
});

/** Resending the verification link and changing the email share one budget: 3 per user per hour. */
export const verificationMailLimiter = rateLimit({
  key: (req) => `verify-mail:user:${req.user?.id ?? clientIp(req)}`,
  limit: 3,
  windowMs: HOUR_MS,
});
