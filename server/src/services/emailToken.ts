import type { Types } from 'mongoose';
import type { EmailTokenType } from '@inventory/shared';
import { EmailToken } from '../models/EmailToken.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

const HOUR_MS = 3_600_000;
export const EMAIL_TOKEN_TTL_MS = {
  'verify-email': 24 * HOUR_MS,
  'reset-password': HOUR_MS,
  'link-telegram': 24 * HOUR_MS,
} as const;

export const invalidTokenError = () =>
  new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has already been used.');

export const expiredTokenError = () =>
  new AppError(400, 'TOKEN_EXPIRED', 'This link has expired. Request a new one.');

/**
 * Creates a single-use token and returns the raw value (only its hash is stored).
 * `telegramChatId` is the payload of a 'link-telegram' token.
 */
export const createEmailToken = async (
  userId: Types.ObjectId | string,
  type: keyof typeof EMAIL_TOKEN_TTL_MS,
  telegramChatId?: string
): Promise<string> => {
  const raw = randomToken();
  await EmailToken.create({
    user: userId,
    type,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[type]),
    ...(telegramChatId ? { telegramChatId } : {}),
  });
  return raw;
};

/**
 * Atomically claims an unused, unexpired token of one of the given types.
 * A token of any other type is left untouched (a reset token must not be spendable on /verify-email).
 */
export const consumeEmailToken = async (raw: string, types: EmailTokenType[]) => {
  const token = await EmailToken.findOneAndUpdate(
    { tokenHash: sha256(raw), type: { $in: types }, consumed: false, expiresAt: { $gt: new Date() } },
    { consumed: true }
  );
  if (token) return token;

  // Tell an expired link apart from an unknown or already used one (expired rows are kept for a while)
  const stale = await EmailToken.exists({
    tokenHash: sha256(raw),
    type: { $in: types },
    consumed: false,
    expiresAt: { $lte: new Date() },
  });
  throw stale ? expiredTokenError() : invalidTokenError();
};

/** Drops a user's still-unused tokens of a type, so only the newest emailed link works. */
export const discardPendingTokens = (userId: Types.ObjectId | string, type: EmailTokenType) =>
  EmailToken.deleteMany({ user: userId, type, consumed: false });
