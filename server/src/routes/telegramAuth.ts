import { Router, type Request } from 'express';
import { telegramCompleteSchema, telegramVerifySchema } from '@inventory/shared';
import { env } from '../config/env.js';
import {
  telegramCompleteLimiter,
  telegramResendLimiter,
  telegramStartLimiter,
  telegramStatusLimiter,
  telegramVerifyLimiter,
} from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { assertNotRejected } from '../services/authAccount.js';
import { assertEmailAvailable } from '../services/email.js';
import { issueSession } from '../services/jwt.js';
import { assertTelegramAvailable, telegramDeepLink } from '../services/telegram.js';
import {
  completeTelegramSignup,
  createAuthSession,
  discardAuthSession,
  getAuthSessionStatus,
  resendOtp,
  verifyOtp,
} from '../services/telegramAuth.js';
import { toAuthUser } from '../utils/authUser.js';

// Telegram sign in / sign up: QR -> code from the bot -> code on the website (-> username + email if new).
// The browser is identified by an httpOnly cookie holding the raw session id; the nonce only travels in the deep link.
// Mounted at /api/auth/telegram by routes/auth.ts.
const router = Router();

const TELEGRAM_SESSION_COOKIE = 'tg_auth_session';
const TELEGRAM_COOKIE_PATH = '/api/auth/telegram';
const TELEGRAM_COOKIE_MAX_AGE_MS = 15 * 60_000;

const telegramCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: TELEGRAM_COOKIE_PATH,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
} as const;

const telegramSessionId = (req: Request): string | undefined => req.cookies?.[TELEGRAM_SESSION_COOKIE];

router.post('/start', telegramStartLimiter, async (req, res) => {
  assertTelegramAvailable();
  const previous = telegramSessionId(req);
  if (previous) await discardAuthSession(previous);

  const { sessionId, nonce, expiresAt } = await createAuthSession();
  res.cookie(TELEGRAM_SESSION_COOKIE, sessionId, { ...telegramCookieOptions, maxAge: TELEGRAM_COOKIE_MAX_AGE_MS });
  res.status(201).json({ deepLink: telegramDeepLink(nonce), expiresAt: expiresAt.toISOString() });
});

router.get('/status', telegramStatusLimiter, async (req, res) => {
  assertTelegramAvailable();
  res.json(await getAuthSessionStatus(telegramSessionId(req)));
});

router.post('/verify', telegramVerifyLimiter, validate(telegramVerifySchema), async (req, res) => {
  assertTelegramAvailable();
  const result = await verifyOtp(telegramSessionId(req), req.body.code);
  if (result.status === 'AWAITING_PROFILE') {
    res.json({ status: 'AWAITING_PROFILE', prefillDisplayName: result.prefillDisplayName });
    return;
  }

  assertNotRejected(result.user);
  // Pending users still get a session; the client routes them by /auth/me
  await issueSession(res, result.user);
  res.clearCookie(TELEGRAM_SESSION_COOKIE, telegramCookieOptions);
  res.json({ status: 'COMPLETED', user: toAuthUser(result.user) });
});

router.post('/resend', telegramResendLimiter, async (req, res) => {
  assertTelegramAvailable();
  res.json(await resendOtp(telegramSessionId(req)));
});

router.post('/complete', telegramCompleteLimiter, validate(telegramCompleteSchema), async (req, res) => {
  assertTelegramAvailable();
  assertEmailAvailable();
  const result = await completeTelegramSignup(telegramSessionId(req), req.body);

  res.clearCookie(TELEGRAM_SESSION_COOKIE, telegramCookieOptions);
  if (result.outcome === 'created') {
    await issueSession(res, result.user);
    res.status(201).json({ status: 'COMPLETED', outcome: 'created', user: toAuthUser(result.user) });
    return;
  }
  // 'link-sent': the email belongs to an account; the owner confirms by link. Nobody is signed in.
  res.json({ status: 'COMPLETED', outcome: result.outcome });
});

export default router;
