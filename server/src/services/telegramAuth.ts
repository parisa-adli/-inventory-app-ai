import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env.js';
import { AuthSession, type AuthSessionDoc, type AuthSessionStatus } from '../models/AuthSession.js';
import { User, type UserDoc } from '../models/User.js';
import { hmacSha256, randomOtp, randomToken, safeEqual, sha256 } from '../utils/crypto.js';
import { AppError, ForbiddenError, isDuplicateKeyError } from '../utils/errors.js';
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
  linkCode: (code: string) =>
    `Your code to link this Telegram account to Inventory Manager is ${code}\n\nEnter it on the Profile page within 2 minutes. Never share this code with anyone.`,
  welcome: 'Welcome! To sign in or sign up, open the website, choose Telegram and scan the QR code shown there.',
  expired: 'That QR code has expired or was already used. Go back to the website and press "Start over".',
} as const;

type SessionDoc = HydratedDocument<AuthSessionDoc>;

/**
 * Raw secrets are returned once; only their hashes are stored.
 * `linkFor`: a signed-in user linking Telegram from the Profile page (purpose LINK, bound to them).
 */
export const createAuthSession = async (linkFor?: string) => {
  const sessionId = randomToken(SECRET_BYTES);
  const nonce = randomToken(SECRET_BYTES);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);

  await AuthSession.create({
    sessionIdHash: sha256(sessionId),
    nonceHash: sha256(nonce),
    expiresAt,
    ...(linkFor ? { purpose: 'LINK', user: linkFor } : {}),
  });
  return { sessionId, nonce, expiresAt };
};

const telegramInUseError = () =>
  new AppError(409, 'TELEGRAM_IN_USE', 'This Telegram account is already linked to an account.');

/** POST /telegram/link. An account has at most one Telegram link; unlink the current one first. */
export const createLinkSession = async (userId: string) => {
  if (await User.exists({ _id: userId, telegramChatId: { $exists: true } })) {
    throw new AppError(409, 'TELEGRAM_ALREADY_LINKED', 'Your account already has a Telegram account linked.');
  }
  return createAuthSession(userId);
};

/** The bot's message with a code: linking says so, sign in and sign up share one text. */
const codeMessage = (session: { purpose?: string | null }, code: string) =>
  session.purpose === 'LINK' ? MESSAGES.linkCode(code) : MESSAGES.code(code);

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
  return codeMessage(session, code);
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
  /** LINK attempt: the chat is now linked to the signed-in caller, who keeps their session. */
  | { status: 'LINKED'; user: HydratedDocument<UserDoc> }
  /** Unknown Telegram account: the website must ask for a username and an email. */
  | { status: 'AWAITING_PROFILE'; prefillDisplayName?: string };

/**
 * `callerId` resolves the signed-in user of the request (or throws 401). Only a LINK attempt calls it,
 * so sign in and sign up never look at the access cookie.
 */
export const verifyOtp = async (
  sessionId: string | undefined,
  code: string,
  callerId: () => Promise<string>,
  now = Date.now()
): Promise<VerifyResult> => {
  const session = await requireSession(sessionId);
  // Checked before the code, so a missing or expired access token (401: the client refreshes and
  // retries) does not spend an attempt
  if (session.purpose === 'LINK' && String(session.user) !== (await callerId())) {
    await AuthSession.updateOne({ _id: session._id }, { status: 'EXPIRED' });
    throw new ForbiddenError('This link was started by another account.');
  }
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

  if (session.purpose === 'LINK') return linkChat(session);

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

  if (user) {
    // Keep the shown @handle current (the person may have changed it in Telegram); nothing else is written
    if ((user.telegramUsername ?? undefined) !== (session.telegramUsername ?? undefined)) {
      user.telegramUsername = session.telegramUsername ?? undefined;
      await user.save();
    }
    return { status: 'COMPLETED', user };
  }
  return { status: 'AWAITING_PROFILE', prefillDisplayName: session.prefillDisplayName ?? undefined };
};

/** LINK attempt with a verified code: the attempt ends here whatever happens next. */
const linkChat = async (session: SessionDoc): Promise<VerifyResult> => {
  const claimed = await AuthSession.findOneAndUpdate(
    { _id: session._id, status: 'AWAITING_OTP', otpHash: session.otpHash },
    { status: 'COMPLETED', $unset: { otpHash: 1, otpExpiresAt: 1 } }
  );
  if (!claimed) throw sessionExpiredError();

  const chatId = String(session.telegramId);
  if (await User.exists({ telegramChatId: chatId })) throw telegramInUseError();
  try {
    // Conditional: the caller may have linked another chat meanwhile (one link per account)
    const user = await User.findOneAndUpdate(
      { _id: session.user, telegramChatId: { $exists: false } },
      { telegramChatId: chatId, telegramUsername: session.telegramUsername ?? undefined },
      { returnDocument: 'after' }
    );
    if (!user) throw telegramInUseError();
    return { status: 'LINKED', user };
  } catch (err) {
    // The unique index catches a chat linked elsewhere between the check and the update
    if (isDuplicateKeyError(err)) throw telegramInUseError();
    throw err;
  }
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

  await sendTelegramMessage(session.telegramId, codeMessage(session, code));
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
      telegramUsername: session.telegramUsername ?? undefined,
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
