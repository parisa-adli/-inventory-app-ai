import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env.js';
import { AuthSession, type AuthSessionDoc, type AuthSessionStatus } from '../models/AuthSession.js';
import { User, type UserDoc } from '../models/User.js';
import { hmacSha256, randomOtp, randomToken, safeEqual, sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { sendTelegramMessage } from './telegram.js';
import { signupWithTelegram, type TelegramSignupOutcome } from './telegramSignup.js';

export const AUTH_SESSION_TTL_MS = 5 * 60_000;
/** After the code is verified the user still fills in a form, so the session gets a little longer. */
export const PROFILE_STEP_TTL_MS = 10 * 60_000;
export const OTP_TTL_MS = 2 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_RESENDS = 3;
export const MAX_COMPLETE_ATTEMPTS = 5;

// 24 bytes -> 48 hex chars: fits Telegram's 64 char /start payload limit
const SECRET_BYTES = 24;

export const MESSAGES = {
  code: (code: string) =>
    `Your verification code is ${code}\n\nEnter it on the website within 2 minutes. Never share this code with anyone.`,
  welcome: 'Welcome! To sign in or sign up, open the website, choose Telegram and scan the QR code shown there.',
  expired: 'That QR code has expired or was already used. Go back to the website and press "Start over".',
} as const;

type SessionDoc = HydratedDocument<AuthSessionDoc>;

/** Raw secrets are returned once; only their hashes are stored. */
export const createAuthSession = async () => {
  const sessionId = randomToken(SECRET_BYTES);
  const nonce = randomToken(SECRET_BYTES);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);

  await AuthSession.create({ sessionIdHash: sha256(sessionId), nonceHash: sha256(nonce), expiresAt });
  return { sessionId, nonce, expiresAt };
};

/** Drops the session a browser held before it asked for a fresh QR code. */
export const discardAuthSession = (sessionId: string) =>
  AuthSession.deleteOne({ sessionIdHash: sha256(sessionId) });

/** HMAC bound to the session, so a leaked hash cannot be replayed or brute-forced without the server secret. */
const hashOtp = (code: string, sessionIdHash: string): string =>
  hmacSha256(`${sessionIdHash}:${code}`, env.JWT_ACCESS_SECRET);

const isLive = (session: { expiresAt: Date }): boolean => session.expiresAt.getTime() > Date.now();

export const findAuthSession = async (sessionId: string | undefined): Promise<SessionDoc | null> => {
  if (!sessionId) return null;
  return AuthSession.findOne({ sessionIdHash: sha256(sessionId) });
};

const sessionExpiredError = () =>
  new AppError(410, 'SESSION_EXPIRED', 'This session has expired. Press "Start over" to try again.');
const lockedError = () =>
  new AppError(423, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Press "Start over" to try again.');

/** Resolves the session of a request, or throws for a missing, expired or locked one. */
const requireSession = async (sessionId: string | undefined): Promise<SessionDoc> => {
  const session = await findAuthSession(sessionId);
  if (!session || !isLive(session) || session.status === 'EXPIRED') throw sessionExpiredError();
  if (session.status === 'LOCKED') throw lockedError();
  return session;
};

export interface BotStartSender {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Called by the bot on "/start <nonce>". Links the Telegram account to the session and hands out a code.
 * The claim is atomic on status PENDING, so a nonce works once and a second Start never overwrites telegramId.
 * Returns the reply for the chat.
 */
export const startFromBot = async (nonce: string, from: BotStartSender, now = Date.now()): Promise<string> => {
  const session = await AuthSession.findOne({ nonceHash: sha256(nonce) });
  if (!session || session.status !== 'PENDING' || session.expiresAt.getTime() <= now) return MESSAGES.expired;

  const code = randomOtp();
  const displayName = [from.firstName, from.lastName].filter(Boolean).join(' ').trim();
  const claimed = await AuthSession.findOneAndUpdate(
    { _id: session._id, status: 'PENDING', expiresAt: { $gt: new Date(now) } },
    {
      status: 'AWAITING_OTP',
      telegramId: from.id,
      telegramUsername: from.username,
      prefillDisplayName: displayName || from.username,
      otpHash: hashOtp(code, session.sessionIdHash),
      lastSentAt: new Date(now),
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      attempts: 0,
    }
  );
  if (!claimed) return MESSAGES.expired;
  return MESSAGES.code(code);
};

export interface AuthSessionStatusView {
  status: AuthSessionStatus;
  expiresAt?: string;
  otpExpiresAt?: string;
  /** When "Resend code" becomes available again (null once the resend limit is used). */
  resendAvailableAt?: string | null;
  prefillDisplayName?: string;
}

/** What the browser may know about its session; reads of dead sessions answer EXPIRED. */
export const getAuthSessionStatus = async (sessionId: string | undefined): Promise<AuthSessionStatusView> => {
  const session = await findAuthSession(sessionId);
  if (!session || !isLive(session) || session.status === 'EXPIRED') return { status: 'EXPIRED' };

  const view: AuthSessionStatusView = { status: session.status, expiresAt: session.expiresAt.toISOString() };
  if (session.status === 'AWAITING_OTP') {
    view.otpExpiresAt = session.otpExpiresAt?.toISOString();
    view.resendAvailableAt =
      session.resends >= MAX_RESENDS || !session.lastSentAt
        ? null
        : new Date(session.lastSentAt.getTime() + RESEND_COOLDOWN_MS).toISOString();
  }
  if (session.status === 'AWAITING_PROFILE') view.prefillDisplayName = session.prefillDisplayName ?? undefined;
  return view;
};

export type VerifyResult =
  /** Telegram account is linked to this user: sign them in. */
  | { status: 'COMPLETED'; user: HydratedDocument<UserDoc> }
  /** Unknown Telegram account: the website must ask for a username and an email. */
  | { status: 'AWAITING_PROFILE'; prefillDisplayName?: string };

export const verifyOtp = async (sessionId: string | undefined, code: string, now = Date.now()): Promise<VerifyResult> => {
  const session = await requireSession(sessionId);
  if (session.status !== 'AWAITING_OTP' || !session.otpHash || !session.otpExpiresAt) {
    throw new AppError(409, 'NO_CODE_PENDING', 'Press Start in the Telegram bot first to receive a code.');
  }
  if (session.otpExpiresAt.getTime() <= now) {
    throw new AppError(410, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  }

  if (!safeEqual(hashOtp(code, session.sessionIdHash), session.otpHash)) {
    // Atomic increment: parallel guesses cannot sneak past the limit
    const after = await AuthSession.findOneAndUpdate(
      { _id: session._id, status: 'AWAITING_OTP' },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after' }
    );
    if (after && after.attempts >= MAX_ATTEMPTS) {
      await AuthSession.updateOne({ _id: session._id }, { status: 'LOCKED' });
      throw lockedError();
    }
    const left = after ? MAX_ATTEMPTS - after.attempts : 0;
    throw new AppError(400, 'INVALID_OTP', `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`);
  }

  const user = await User.findOne({ telegramChatId: String(session.telegramId) });
  const update = user
    ? { status: 'COMPLETED' as const, purpose: 'LOGIN' as const, user: user._id }
    : {
        status: 'AWAITING_PROFILE' as const,
        purpose: 'SIGNUP' as const,
        expiresAt: new Date(now + PROFILE_STEP_TTL_MS),
      };

  // Claiming on the exact hash makes a verified code single use, even for two parallel requests
  const claimed = await AuthSession.findOneAndUpdate(
    { _id: session._id, status: 'AWAITING_OTP', otpHash: session.otpHash },
    { ...update, $unset: { otpHash: 1, otpExpiresAt: 1 } }
  );
  if (!claimed) throw sessionExpiredError();

  if (user) return { status: 'COMPLETED', user };
  return { status: 'AWAITING_PROFILE', prefillDisplayName: session.prefillDisplayName ?? undefined };
};

/** Sends a fresh code to the linked Telegram account. Cooldown and the resend cap are enforced here. */
export const resendOtp = async (sessionId: string | undefined, now = Date.now()): Promise<{ resendAvailableAt: string | null; otpExpiresAt: string }> => {
  const session = await requireSession(sessionId);
  if (session.status !== 'AWAITING_OTP' || session.telegramId == null) {
    throw new AppError(409, 'NO_CODE_PENDING', 'Press Start in the Telegram bot first to receive a code.');
  }
  if (session.resends >= MAX_RESENDS) {
    throw new AppError(429, 'RESEND_LIMIT', 'No more codes can be sent. Press "Start over" to try again.');
  }
  const wait = session.lastSentAt ? session.lastSentAt.getTime() + RESEND_COOLDOWN_MS - now : 0;
  if (wait > 0) {
    throw new AppError(429, 'RESEND_COOLDOWN', `Please wait ${Math.ceil(wait / 1000)} seconds before asking for a new code.`);
  }

  const code = randomOtp();
  const otpExpiresAt = new Date(now + OTP_TTL_MS);
  // Conditional on the old lastSentAt, so two parallel resends send one code
  const claimed = await AuthSession.findOneAndUpdate(
    { _id: session._id, status: 'AWAITING_OTP', resends: session.resends, lastSentAt: session.lastSentAt },
    {
      otpHash: hashOtp(code, session.sessionIdHash),
      otpExpiresAt,
      lastSentAt: new Date(now),
      attempts: 0,
      $inc: { resends: 1 },
    }
  );
  if (!claimed) throw new AppError(429, 'RESEND_COOLDOWN', 'A code was just sent. Please wait a moment.');

  await sendTelegramMessage(session.telegramId, MESSAGES.code(code));
  const resends = session.resends + 1;
  return {
    otpExpiresAt: otpExpiresAt.toISOString(),
    resendAvailableAt: resends >= MAX_RESENDS ? null : new Date(now + RESEND_COOLDOWN_MS).toISOString(),
  };
};

export type CompleteResult =
  | { outcome: Extract<TelegramSignupOutcome, 'created'>; user: HydratedDocument<UserDoc> }
  | { outcome: Exclude<TelegramSignupOutcome, 'created'> };

/**
 * Last step for a Telegram account nobody linked yet: username + email become a pending account
 * (or, for an already registered email, a confirm link is mailed; see `signupWithTelegram`).
 */
export const completeTelegramSignup = async (
  sessionId: string | undefined,
  input: { name: string; email: string }
): Promise<CompleteResult> => {
  const session = await requireSession(sessionId);
  if (session.status !== 'AWAITING_PROFILE' || session.telegramId == null) {
    throw new AppError(409, 'NOT_VERIFIED', 'Verify your Telegram code first.');
  }
  if (session.completeAttempts >= MAX_COMPLETE_ATTEMPTS) {
    await AuthSession.updateOne({ _id: session._id }, { status: 'LOCKED' });
    throw lockedError();
  }

  // Claimed up front: a double submit must not create two accounts
  const claimed = await AuthSession.findOneAndUpdate(
    { _id: session._id, status: 'AWAITING_PROFILE' },
    { status: 'COMPLETED', $inc: { completeAttempts: 1 } }
  );
  if (!claimed) throw sessionExpiredError();

  try {
    const result = await signupWithTelegram({
      chatId: String(session.telegramId),
      name: input.name,
      email: input.email,
    });
    if (result.outcome === 'created' && result.user) {
      await AuthSession.updateOne({ _id: session._id }, { user: result.user._id });
      return { outcome: 'created', user: result.user };
    }
    if (result.outcome === 'already-linked') return { outcome: 'already-linked' };
    return { outcome: 'link-sent' };
  } catch (err) {
    // Nothing was created (e.g. the email could not be sent): let the user submit the form again
    await AuthSession.updateOne({ _id: session._id }, { status: 'AWAITING_PROFILE' });
    throw err;
  }
};
