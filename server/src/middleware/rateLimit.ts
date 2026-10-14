import type { Request, RequestHandler } from 'express';
import expressRateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { RateLimitHit } from '../models/RateLimitHit.js';
import { sha256 } from '../utils/crypto.js';
import { RateLimitedError, isDuplicateKeyError } from '../utils/errors.js';

const WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const RATE_LIMITS = {
  login: 10,
  register: 10,
  resetPassword: 10,
  changePassword: 10,
  telegramStart: 10,
  // The browser polls status every 2 s while the QR code is shown (5 min = ~150 requests)
  telegramStatus: 600,
  // Per IP, on top of the per-session attempt caps
  telegramVerify: 30,
  telegramResend: 10,
  telegramComplete: 10,
  // Mongo-backed email limiters, per hour
  forgotPasswordPerIp: 5,
  forgotPasswordPerEmail: 3,
  // Resending the verification link and changing the email share this budget, per user
  verificationMail: 3,
} as const;

// Route tests fire many requests from one IP; the limiters have their own tests (FORCE_RATE_LIMIT).
// Read per request so a test can flip env.FORCE_RATE_LIMIT.
const bypassed = () => env.NODE_ENV === 'test' && !env.FORCE_RATE_LIMIT;

/** In-memory per-IP limiter (express-rate-limit): counters are lost on restart and not shared between instances. */
export const createIpLimiter = (max: number, windowMs = WINDOW_MS) =>
  expressRateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: bypassed,
    handler: (_req, _res, next) => next(new RateLimitedError()),
  });

export const loginLimiter = createIpLimiter(RATE_LIMITS.login);
export const registerLimiter = createIpLimiter(RATE_LIMITS.register);
export const resetPasswordLimiter = createIpLimiter(RATE_LIMITS.resetPassword);
export const changePasswordLimiter = createIpLimiter(RATE_LIMITS.changePassword);
export const telegramStartLimiter = createIpLimiter(RATE_LIMITS.telegramStart);
export const telegramStatusLimiter = createIpLimiter(RATE_LIMITS.telegramStatus);
export const telegramVerifyLimiter = createIpLimiter(RATE_LIMITS.telegramVerify);
export const telegramResendLimiter = createIpLimiter(RATE_LIMITS.telegramResend);
export const telegramCompleteLimiter = createIpLimiter(RATE_LIMITS.telegramComplete);

interface MongoLimiterOptions {
  /** Identifies who is being limited, e.g. `forgot:ip:1.2.3.4`. Hash anything personal. */
  key: (req: Request) => string;
  limit: number;
  windowMs: number;
}

/**
 * Fixed-window counter kept in Mongo, so limits survive restarts and are shared between instances.
 * Over the limit it answers 429 RATE_LIMITED with `details.retryAfter` (seconds) and a Retry-After header.
 * Put it before any lookup so a real and an unknown email are limited (and answered) identically.
 */
export const createMongoLimiter = ({ key, limit, windowMs }: MongoLimiterOptions): RequestHandler => {
  const incrementCounter = async (id: string, windowEnd: Date) => {
    const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: windowEnd } };
    try {
      return await RateLimitHit.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true });
    } catch (err) {
      // Two first requests of a window can race on the upsert; the loser just increments
      if (!isDuplicateKeyError(err)) throw err;
      return RateLimitHit.findOneAndUpdate({ _id: id }, update, { upsert: true, new: true });
    }
  };

  return async (req, res, next) => {
    if (bypassed()) return next();

    try {
      const now = Date.now();
      const windowIndex = Math.floor(now / windowMs);
      const windowEnd = new Date((windowIndex + 1) * windowMs);
      const counter = await incrementCounter(`${key(req)}:${windowIndex}`, windowEnd);

      if (counter && counter.count > limit) {
        const retryAfter = Math.max(1, Math.ceil((windowEnd.getTime() - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        next(new RateLimitedError(retryAfter));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

const clientIp = (req: Request) => req.ip ?? 'unknown';
const emailKey = (req: Request) => sha256(String(req.body?.email ?? '').toLowerCase());

/** Password reset requests: per IP and per email, per hour. */
export const forgotPasswordIpLimiter = createMongoLimiter({
  key: (req) => `forgot:ip:${clientIp(req)}`,
  limit: RATE_LIMITS.forgotPasswordPerIp,
  windowMs: HOUR_MS,
});
export const forgotPasswordEmailLimiter = createMongoLimiter({
  key: (req) => `forgot:email:${emailKey(req)}`,
  limit: RATE_LIMITS.forgotPasswordPerEmail,
  windowMs: HOUR_MS,
});

/** Resending the verification link and changing the email share one budget per user per hour. */
export const verificationMailLimiter = createMongoLimiter({
  key: (req) => `verify-mail:user:${req.user?.id ?? clientIp(req)}`,
  limit: RATE_LIMITS.verificationMail,
  windowMs: HOUR_MS,
});
