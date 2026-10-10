import { TelegramLogin } from '../models/TelegramLogin.js';
import { User } from '../models/User.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export const TELEGRAM_LOGIN_TTL_MS = 5 * 60_000;

/** Prefix of the /start payload; Telegram allows 64 chars of [A-Za-z0-9_-]. */
export const LOGIN_START_PREFIX = 'login_';

const TOKEN_BYTES = 24; // 48 hex chars, so prefix + token stays under the 64 char limit

export type ApproveOutcome = 'approved' | 'unlinked' | 'expired';

export type PollResult =
  | { status: 'pending' | 'unlinked' | 'expired' }
  | { status: 'approved'; userId: string };

/** Creates a login attempt. `startToken` goes into the QR code, `pollToken` stays with the browser. */
export const createTelegramLogin = async () => {
  const startToken = randomToken(TOKEN_BYTES);
  const pollToken = randomToken(TOKEN_BYTES);
  const expiresAt = new Date(Date.now() + TELEGRAM_LOGIN_TTL_MS);

  await TelegramLogin.create({ startHash: sha256(startToken), pollHash: sha256(pollToken), expiresAt });
  return { startToken, pollToken, expiresAt };
};

/**
 * Called by the bot when a chat pressed Start with a login payload. The chat's linked account
 * (if any) is attached to the attempt; nothing is shown to the chat about other accounts.
 */
export const approveTelegramLogin = async (startToken: string, chatId: string): Promise<ApproveOutcome> => {
  const live = { startHash: sha256(startToken), status: 'pending' as const, expiresAt: { $gt: new Date() } };

  const user = await User.findOne({ telegramChatId: chatId }).select('_id');
  const update = user
    ? { status: 'approved' as const, user: user._id }
    : { status: 'unlinked' as const };

  // Atomic, so a QR code can be approved once and a replayed Start does nothing
  const claimed = await TelegramLogin.findOneAndUpdate(live, update);
  if (!claimed) return 'expired';
  return user ? 'approved' : 'unlinked';
};

/** Called by the browser that showed the QR code. An approved attempt is handed out exactly once. */
export const pollTelegramLogin = async (pollToken: string): Promise<PollResult> => {
  const attempt = await TelegramLogin.findOne({ pollHash: sha256(pollToken) });
  if (!attempt || attempt.expiresAt.getTime() <= Date.now() || attempt.status === 'consumed') {
    return { status: 'expired' };
  }
  if (attempt.status === 'pending') return { status: 'pending' };
  if (attempt.status === 'unlinked') return { status: 'unlinked' };

  const claimed = await TelegramLogin.findOneAndUpdate(
    { _id: attempt._id, status: 'approved', expiresAt: { $gt: new Date() } },
    { status: 'consumed' }
  );
  if (!claimed?.user) return { status: 'expired' };
  return { status: 'approved', userId: String(claimed.user) };
};
