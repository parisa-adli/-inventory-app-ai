import { EmailToken } from '../models/EmailToken.js';
import type { HydratedDocument } from 'mongoose';
import { User, type UserDoc } from '../models/User.js';
import { sendTelegramLinkEmail, sendVerificationEmail } from './email.js';
import { createEmailToken, discardPendingTokens } from './emailToken.js';

export type TelegramSignupOutcome =
  /** New pending account created; a verification link was emailed. */
  | 'created'
  /** Email already belongs to an account; a confirm link was emailed, nothing changed yet. */
  | 'link-sent'
  /** This Telegram chat is already linked to an account; nothing was created. */
  | 'already-linked';

export interface TelegramSignupResult {
  outcome: TelegramSignupOutcome;
  user?: HydratedDocument<UserDoc>;
}

interface TelegramSignupInput {
  chatId: string;
  name: string;
  /** Already normalized (trimmed + lowercased) by the shared email rule. */
  email: string;
}

/**
 * Telegram signup (PRD §3). Called by `completeTelegramSignup` once the Telegram account proved itself with
 * the bot's one-time code; there is deliberately no public "create a user" route.
 * Throws when the email cannot be sent, after cleaning up anything it created.
 * `user` is set only for 'created': the one outcome that may be signed in.
 */
export const signupWithTelegram = async ({
  chatId,
  name,
  email,
}: TelegramSignupInput): Promise<TelegramSignupResult> => {
  if (await User.exists({ telegramChatId: chatId })) return { outcome: 'already-linked' };

  const existing = await User.findOne({ email });
  if (existing) {
    // Only the newest confirm link may work
    await discardPendingTokens(existing._id, 'link-telegram');
    const token = await createEmailToken(existing._id, 'link-telegram', chatId);
    try {
      await sendTelegramLinkEmail(existing.email, existing.name, token);
    } catch (err) {
      await discardPendingTokens(existing._id, 'link-telegram');
      throw err;
    }
    return { outcome: 'link-sent' };
  }

  // No password: the account is Telegram-only until the owner sets one via password reset
  const user = await User.create({ name, email, telegramChatId: chatId });
  try {
    const token = await createEmailToken(user._id, 'verify-email');
    await sendVerificationEmail(user.email, user.name, token);
  } catch (err) {
    // Same rule as /register: no unverifiable account may be left behind
    await EmailToken.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  return { outcome: 'created', user };
};
