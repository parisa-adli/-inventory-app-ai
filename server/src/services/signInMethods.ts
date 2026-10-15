import { User } from '../models/User.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { discardPendingTokens } from './emailToken.js';
import { hashPassword } from './password.js';

// Sign-in methods (CONTEXT.md): a password, a Telegram link, or both. An account always keeps one.
// Every removal is a single conditional update that requires the other method to still exist, so two
// removals at the same moment (two tabs, or the user and an admin) can never leave an account with none.

const lastSignInMethodError = (message: string) => new AppError(409, 'LAST_SIGN_IN_METHOD', message);

const afterUpdate = { returnDocument: 'after' } as const;

/** Missing user -> 404; otherwise the conditional update failed because of the rule. */
const explain = async (userId: string, error: AppError) => {
  if (!(await User.exists({ _id: userId }))) throw new NotFoundError('User not found');
  throw error;
};

/** A Telegram-only account adds a password. One that has a password changes it instead (POST /auth/password). */
export const setPassword = async (userId: string, newPassword: string) => {
  const passwordHash = await hashPassword(newPassword);
  const user = await User.findOneAndUpdate(
    { _id: userId, passwordHash: { $exists: false } },
    { passwordHash },
    afterUpdate
  );
  if (!user) {
    return explain(
      userId,
      new AppError(409, 'PASSWORD_ALREADY_SET', 'This account already has a password. Change it instead.')
    );
  }
  return user;
};

/** No re-authentication: the emailed password reset is the way back. */
export const removePassword = async (userId: string) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, telegramChatId: { $exists: true } },
    { $unset: { passwordHash: 1 } },
    afterUpdate
  );
  if (!user) {
    return explain(userId, lastSignInMethodError('Your password is your only way to sign in. Link Telegram before removing it.'));
  }
  return user;
};

/** Used by the user (Profile) and by an admin. A pending link-telegram confirmation dies too. */
export const unlinkTelegram = async (userId: string) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, passwordHash: { $exists: true } },
    { $unset: { telegramChatId: 1, telegramUsername: 1 } },
    afterUpdate
  );
  if (!user) {
    return explain(userId, lastSignInMethodError('Telegram is the only way to sign in to this account. Add a password before unlinking it.'));
  }
  await discardPendingTokens(user._id, 'link-telegram');
  return user;
};
