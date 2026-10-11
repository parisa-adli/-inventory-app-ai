import { Router } from 'express';
import {
  ACCOUNT_STATUS,
  USER_ROLES,
  changeEmailSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  telegramLoginPollSchema,
} from '@inventory/shared';
import { requireAuth } from '../middleware/auth.js';
import {
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  loginLimiter,
  registerLimiter,
  resetPasswordLimiter,
  telegramLoginPollLimiter,
  telegramLoginStartLimiter,
  verificationMailLimiter,
} from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import {
  assertEmailAvailable,
  pendingUsersUrl,
  sendPasswordResetEmail,
  sendTracked,
  sendUserAwaitingApprovalEmail,
  sendVerificationEmail,
  type DeliveryResult,
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
  LOGIN_START_PREFIX,
  createTelegramLogin,
  pollTelegramLogin,
} from '../services/telegramLogin.js';
import { toAuthUser } from '../utils/authUser.js';
import { randomToken } from '../utils/crypto.js';
import { AppError, ForbiddenError, UnauthorizedError } from '../utils/errors.js';

const router = Router();

const duplicateEmailError = () => new AppError(409, 'DUPLICATE_EMAIL', 'This email is already registered.');

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = hashPassword(randomToken());

/** `{ devMailUrl }` when the mail was only logged to the console (dev), otherwise nothing. */
const devMail = (sent?: DeliveryResult) => (sent?.devMailUrl ? { devMailUrl: sent.devMailUrl } : {});

/** Fire-and-forget: tells every active admin that a user can now be approved. */
const notifyAdminsAwaitingApproval = async (user: { name: string; email: string }) => {
  const admins = await User.find({ role: USER_ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE });
  await Promise.allSettled(
    admins.map((admin) =>
      sendUserAwaitingApprovalEmail(admin.email, admin.name, user.name, user.email, pendingUsersUrl())
    )
  );
};

/** The background half of POST /forgot-password. Never throws: the caller already got its 204. */
const issueResetLink = async (email: string) => {
  try {
    const user = await User.findOne({ email });
    if (!user) return;
    await discardPendingTokens(user._id, 'reset-password');
    const token = await createEmailToken(user._id, 'reset-password');
    await sendTracked(user._id, 'reset-password', () => sendPasswordResetEmail(user.email, user.name, token));
  } catch (err) {
    console.error('Password reset email failed:', err instanceof Error ? err.message : 'unknown error');
  }
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

  let sent;
  try {
    const token = await createEmailToken(user._id, 'verify-email');
    sent = await sendVerificationEmail(user.email, user.name, token);
  } catch (err) {
    // No unverifiable account may be left behind when the email could not go out
    await EmailToken.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  res.status(201).json({
    message: 'Account created. Check your email to verify your address.',
    ...devMail(sent),
  });
});

router.get('/verify-email/:token', async (req, res) => {
  const token = await consumeEmailToken(req.params.token, ['verify-email', 'link-telegram']);

  switch (token.type) {
    case 'verify-email': {
      // Returns the document as it was before the update
      const before = await User.findByIdAndUpdate(token.user, { emailVerified: true });
      if (!before) throw invalidTokenError();
      if (!before.emailVerified && before.status === ACCOUNT_STATUS.PENDING) {
        void notifyAdminsAwaitingApproval(before).catch(() => {});
      }
      res.json({ verified: true, type: 'verify-email' });
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
      res.json({ verified: true, type: 'link-telegram' });
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

// Telegram QR login: the browser shows a QR code, the phone presses Start in the bot, the browser polls.
router.post('/telegram/login', telegramLoginStartLimiter, async (_req, res) => {
  assertTelegramAvailable();
  const { startToken, pollToken, expiresAt } = await createTelegramLogin();

  res.status(201).json({
    deepLink: telegramDeepLink(`${LOGIN_START_PREFIX}${startToken}`),
    pollToken,
    expiresAt: expiresAt.toISOString(),
  });
});

// POST (not GET) so the poll secret never lands in URLs or access logs
router.post(
  '/telegram/login/poll',
  telegramLoginPollLimiter,
  validate(telegramLoginPollSchema),
  async (req, res) => {
    assertTelegramAvailable();
    const result = await pollTelegramLogin(req.body.pollToken);
    if (result.status !== 'approved') {
      res.json({ status: result.status });
      return;
    }

    const user = await User.findById(result.userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'This login is no longer valid.');

    if (user.status === ACCOUNT_STATUS.REJECTED) {
      throw new AppError(403, 'ACCOUNT_REJECTED', 'Your account has been rejected or revoked.');
    }

    // Pending users still get a session; the client routes them by /auth/me
    await issueSession(res, user);
    res.json({ status: 'approved', user: toAuthUser(user) });
  }
);

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

// Resend and change-email share one budget (3 per user per hour)
router.post('/resend-verification', requireAuth, verificationMailLimiter, async (req, res) => {
  assertEmailAvailable();
  const user = await User.findById(req.user!.id);
  if (!user) throw new UnauthorizedError('User no longer exists');

  let sent;
  if (!user.emailVerified) {
    await discardPendingTokens(user._id, 'verify-email');
    const token = await createEmailToken(user._id, 'verify-email');
    sent = await sendTracked(user._id, 'verify-email', () => sendVerificationEmail(user.email, user.name, token));
  }
  res.json(devMail(sent));
});

// An unverified user fixes a typo in their address; the old verification link stops working
router.patch('/email', requireAuth, verificationMailLimiter, validate(changeEmailSchema), async (req, res) => {
  assertEmailAvailable();
  const user = await User.findById(req.user!.id);
  if (!user) throw new UnauthorizedError('User no longer exists');
  if (user.emailVerified) throw new ForbiddenError('Your email address is already verified.');

  const { email } = req.body;
  if (email !== user.email) {
    if (await User.exists({ email })) throw duplicateEmailError();
    user.email = email;
    try {
      await user.save();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw duplicateEmailError();
      throw err;
    }
  }

  await discardPendingTokens(user._id, 'verify-email');
  const token = await createEmailToken(user._id, 'verify-email');
  const sent = await sendTracked(user._id, 'verify-email', () =>
    sendVerificationEmail(user.email, user.name, token)
  );
  res.json({ user: toAuthUser(user), ...devMail(sent) });
});

// Answers 204 before any lookup, so a known and an unknown email cannot be told apart by time or body.
// The per-IP and per-email limits run first and are counted the same way for both.
router.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordEmailLimiter,
  (req, res) => {
    // Fails the same way for every email when mail is down, so it cannot reveal which accounts exist
    assertEmailAvailable();
    res.status(204).end();
    void issueResetLink(req.body.email);
  }
);

router.post('/reset-password/:token', resetPasswordLimiter, validate(resetPasswordSchema), async (req, res) => {
  // Hash before spending the token, so a failure here cannot burn the user's only link
  const passwordHash = await hashPassword(req.body.password);
  const token = await consumeEmailToken(String(req.params.token), ['reset-password']);

  const user = await User.findByIdAndUpdate(token.user, { passwordHash });
  if (!user) throw invalidTokenError();
  await revokeAllUserTokens(String(user._id));

  // No session: the user signs in with the new password
  res.status(204).end();
});

export default router;
