import { Router, type Request } from 'express';
import { env } from '../config/env.js';
import {
  ACCOUNT_STATUS,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  telegramCompleteSchema,
  telegramVerifySchema,
} from '@inventory/shared';
import { requireAuth } from '../middleware/auth.js';
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  telegramCompleteLimiter,
  telegramResendLimiter,
  telegramStartLimiter,
  telegramStatusLimiter,
  telegramVerifyLimiter,
} from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import {
  assertEmailAvailable,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/email.js';
import {
  consumeEmailToken,
  createEmailToken,
  discardPendingTokens,
  invalidTokenError,
} from '../services/emailToken.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  issueSession,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/jwt.js';
import { hashPassword, verifyPassword } from '../services/password.js';
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
import { randomToken } from '../utils/crypto.js';
import { AppError, UnauthorizedError } from '../utils/errors.js';

const router = Router();

const duplicateEmailError = () => new AppError(409, 'DUPLICATE_EMAIL', 'This email is already registered.');

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = hashPassword(randomToken());

const GENERIC_FORGOT_RESPONSE = {
  message: 'If an account exists for that email, a password reset link has been sent.',
};

router.post('/register', registerLimiter, validate(registerSchema), async (req, res) => {
  assertEmailAvailable();
  const { name, email, password } = req.body;

  // Registration deliberately reveals duplicates (PRD §3)
  if (await User.exists({ email })) throw duplicateEmailError();

  let user;
  try {
    user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw duplicateEmailError();
    throw err;
  }

  try {
    const token = await createEmailToken(user._id, 'verify-email');
    await sendVerificationEmail(user.email, user.name, token);
  } catch (err) {
    // No unverifiable account may be left behind when the email could not go out
    await EmailToken.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  res.status(201).json({ message: 'Account created. Check your email to verify your address.' });
});

router.get('/verify-email/:token', async (req, res) => {
  const token = await consumeEmailToken(req.params.token, ['verify-email', 'link-telegram']);

  switch (token.type) {
    case 'verify-email': {
      const user = await User.findByIdAndUpdate(token.user, { emailVerified: true });
      if (!user) throw invalidTokenError();
      res.json({ type: 'verify-email', message: 'Email verified.' });
      return;
    }
    case 'link-telegram': {
      // Attaches the chat only; confirming a Telegram link does not verify the email (PRD §3)
      const chatId = token.telegramChatId;
      if (!chatId) throw invalidTokenError();
      // The chat may have been linked to another account since this link was emailed
      if (await User.exists({ telegramChatId: chatId, _id: { $ne: token.user } })) throw invalidTokenError();

      try {
        // An already linked, different chat is replaced
        const user = await User.findByIdAndUpdate(token.user, { telegramChatId: chatId });
        if (!user) throw invalidTokenError();
      } catch (err) {
        if ((err as { code?: number }).code === 11000) throw invalidTokenError();
        throw err;
      }
      res.json({ type: 'link-telegram', message: 'Telegram linked.' });
      return;
    }
    default:
      throw invalidTokenError();
  }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !user.passwordHash || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  // Only reached with a correct password, so the status is not leaked to strangers
  if (user.status === ACCOUNT_STATUS.REJECTED) {
    throw new AppError(403, 'ACCOUNT_REJECTED', 'Your account has been rejected or revoked.');
  }

  // Pending users still get a session; the client routes them by /auth/me
  await issueSession(res, user);
  res.json({ user: toAuthUser(user) });
});

// Telegram sign in / sign up: QR -> code from the bot -> code on the website (-> username + email if new).
// The browser is identified by an httpOnly cookie holding the raw session id; the nonce only travels in the deep link.
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

/** A rejected account never gets a session, whichever way it arrives. */
const assertNotRejected = (user: { status: string }) => {
  if (user.status === ACCOUNT_STATUS.REJECTED) {
    throw new AppError(403, 'ACCOUNT_REJECTED', 'Your account has been rejected or revoked.');
  }
};

router.post('/telegram/start', telegramStartLimiter, async (req, res) => {
  assertTelegramAvailable();
  const previous = telegramSessionId(req);
  if (previous) await discardAuthSession(previous);

  const { sessionId, nonce, expiresAt } = await createAuthSession();
  res.cookie(TELEGRAM_SESSION_COOKIE, sessionId, { ...telegramCookieOptions, maxAge: TELEGRAM_COOKIE_MAX_AGE_MS });
  res.status(201).json({ deepLink: telegramDeepLink(nonce), expiresAt: expiresAt.toISOString() });
});

router.get('/telegram/status', telegramStatusLimiter, async (req, res) => {
  assertTelegramAvailable();
  res.json(await getAuthSessionStatus(telegramSessionId(req)));
});

router.post('/telegram/verify', telegramVerifyLimiter, validate(telegramVerifySchema), async (req, res) => {
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

router.post('/telegram/resend', telegramResendLimiter, async (req, res) => {
  assertTelegramAvailable();
  res.json(await resendOtp(telegramSessionId(req)));
});

router.post('/telegram/complete', telegramCompleteLimiter, validate(telegramCompleteSchema), async (req, res) => {
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

router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw new UnauthorizedError('Refresh token missing');

  try {
    const user = await rotateRefreshToken(raw, res);
    res.json({ user: toAuthUser(user) });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
});

// No requireAuth: an expired access token must not stop a user from clearing their session
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) await revokeRefreshToken(raw);
  clearAuthCookies(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new UnauthorizedError('User no longer exists');
  res.json(toAuthUser(user));
});

router.post('/resend-verification', requireAuth, resendVerificationLimiter, async (req, res) => {
  assertEmailAvailable();
  const user = await User.findById(req.user!.id);
  if (!user) throw new UnauthorizedError('User no longer exists');

  if (!user.emailVerified) {
    await discardPendingTokens(user._id, 'verify-email');
    const token = await createEmailToken(user._id, 'verify-email');
    await sendVerificationEmail(user.email, user.name, token);
  }
  res.status(204).end();
});

router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), async (req, res) => {
  // Fails the same way for every email when mail is down, so it cannot reveal which accounts exist
  assertEmailAvailable();

  const user = await User.findOne({ email: req.body.email });
  if (user) {
    await discardPendingTokens(user._id, 'reset-password');
    const token = await createEmailToken(user._id, 'reset-password');
    // Not awaited and errors swallowed: neither timing nor a failure may differ for known emails
    sendPasswordResetEmail(user.email, user.name, token).catch(() => {});
  }

  res.json(GENERIC_FORGOT_RESPONSE);
});

router.post('/reset-password/:token', resetPasswordLimiter, validate(resetPasswordSchema), async (req, res) => {
  const token = await consumeEmailToken(String(req.params.token), ['reset-password']);

  const user = await User.findById(token.user);
  if (!user) throw invalidTokenError();

  user.passwordHash = await hashPassword(req.body.password);
  await user.save();
  await revokeAllUserTokens(String(user._id));

  res.json({ message: 'Password updated. Please log in.' });
});

export default router;
