import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import { sendTelegramLinkEmail, sendVerificationEmail } from './email.js';
import { createEmailToken, discardPendingTokens } from './emailToken.js';

export type TelegramSignupOutcome =
  /** New pending account created; a verification link was emailed. */
  | 'created'
  /** Email already belongs to an account; a confirm link was emailed, nothing changed yet. */
  | 'link-sent'
  /** This Telegram chat is already linked to an account; nothing was created. */
  | 'already-linked';

interface TelegramSignupInput {
  chatId: string;
  name: string;
  /** Already normalized (trimmed + lowercased) by the shared email rule. */
  email: string;
}

/**
 * Telegram signup (PRD §3). Called by the in-process bot; there is deliberately no public HTTP route.
 * Throws when the email cannot be sent, after cleaning up anything it created.
 */
export const signupWithTelegram = async ({
  chatId,
  name,
  email,
}: TelegramSignupInput): Promise<TelegramSignupOutcome> => {
  if (await User.exists({ telegramChatId: chatId })) return 'already-linked';

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
    return 'link-sent';
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
  return 'created';
};
