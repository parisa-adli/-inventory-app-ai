import { Router, type Request } from 'express';
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@inventory/shared';
import { signedIn } from '../middleware/guards.js';
import {
  changePasswordLimiter,
  forgotPasswordEmailLimiter,
  forgotPasswordIpLimiter,
  loginLimiter,
  registerLimiter,
  resetPasswordLimiter,
  verificationMailLimiter,
} from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import {
  authenticate,
  changePassword,
  changeUnverifiedEmail,
  confirmEmailToken,
  issueResetLink,
  registerUser,
  resendVerification,
  resetPassword,
} from '../services/authAccount.js';
import { assertEmailAvailable, type DeliveryResult } from '../services/email.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  issueSession,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/jwt.js';
import { toAuthUser } from '../utils/authUser.js';
import { UnauthorizedError } from '../utils/errors.js';
import telegramAuthRouter from './telegramAuth.js';

// Account rules live in services/authAccount.ts; this router only guards, calls and shapes responses.
const router = Router();

/** `{ devMailUrl }` when the mail was only logged to the console (dev), otherwise nothing. */
const devMail = (sent?: DeliveryResult) => (sent?.devMailUrl ? { devMailUrl: sent.devMailUrl } : {});

/** The signed-in user's document; a session can outlive its account. */
const currentUser = async (req: Request) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new UnauthorizedError('User no longer exists');
  return user;
};

router.use('/telegram', telegramAuthRouter);

router.post('/register', registerLimiter, validate(registerSchema), async (req, res) => {
  assertEmailAvailable();
  const sent = await registerUser(req.body);
  res.status(201).json({
    message: 'Account created. Check your email to verify your address.',
    ...devMail(sent),
  });
});

router.get('/verify-email/:token', async (req, res) => {
  const type = await confirmEmailToken(req.params.token);
  res.json({ verified: true, type });
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);
  // Pending users still get a session; the client routes them by /auth/me
  await issueSession(res, user);
  res.json({ user: toAuthUser(user) });
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

router.get('/me', ...signedIn, async (req, res) => {
  res.json(toAuthUser(await currentUser(req)));
});

// Resend and change-email share one budget (3 per user per hour)
router.post('/resend-verification', ...signedIn, verificationMailLimiter, async (req, res) => {
  assertEmailAvailable();
  res.json(devMail(await resendVerification(await currentUser(req))));
});

// signedIn only, on purpose: callers are unverified, pending users acting on their own account (no role guard)
router.patch('/email', ...signedIn, validate(changeEmailSchema), verificationMailLimiter, async (req, res) => {
  assertEmailAvailable();
  const user = await currentUser(req);
  const sent = await changeUnverifiedEmail(user, req.body.email);
  res.json({ user: toAuthUser(user), ...devMail(sent) });
});

// Answers 204 before any lookup, so a known and an unknown email cannot be told apart by time or body.
// Validation runs first (malformed bodies spend no budget), then the per-IP and per-email limits,
// counted the same way for both.
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  (req, res) => {
    // Fails the same way for every email when mail is down, so it cannot reveal which accounts exist
    assertEmailAvailable();
    res.status(204).end();
    void issueResetLink(req.body.email);
  }
);

router.post('/reset-password/:token', resetPasswordLimiter, validate(resetPasswordSchema), async (req, res) => {
  await resetPassword(String(req.params.token), req.body.password);
  // No session: the user signs in with the new password
  res.status(204).end();
});

// signedIn only: this is the way out of PASSWORD_CHANGE_REQUIRED, and gated (pending) users may change
// their own password too.
router.post('/password', ...signedIn, changePasswordLimiter, validate(changePasswordSchema), async (req, res) => {
  const user = await currentUser(req);
  await changePassword(user, req.body.currentPassword, req.body.newPassword);
  // Every other device was signed out; this one gets a fresh session
  await issueSession(res, user);
  res.json({ user: toAuthUser(user) });
});

export default router;
