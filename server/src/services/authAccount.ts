import type { HydratedDocument } from 'mongoose';
import { ACCOUNT_STATUS } from '@inventory/shared';
import { EmailToken } from '../models/EmailToken.js';
import { User, type UserDoc } from '../models/User.js';
import { randomToken } from '../utils/crypto.js';
import { AppError, ForbiddenError, isDuplicateKeyError } from '../utils/errors.js';
import { notifyAdminsAwaitingApproval, sendTracked } from './accountMail.js';
import { sendPasswordResetEmail, sendVerificationEmail, type DeliveryResult } from './email.js';
import { consumeEmailToken, createEmailToken, discardPendingTokens, invalidTokenError } from './emailToken.js';
import { revokeAllUserTokens } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';

type UserDocument = HydratedDocument<UserDoc>;
type ConsumedToken = Awaited<ReturnType<typeof consumeEmailToken>>;

const duplicateEmailError = () => new AppError(409, 'DUPLICATE_EMAIL', 'This email is already registered.');

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = hashPassword(randomToken());

/** Awaits a write and turns a unique-index violation into `toError()`; other errors pass through. */
const mapDuplicateKey = async <T>(write: Promise<T>, toError: () => AppError): Promise<T> => {
  try {
    return await write;
  } catch (err) {
    if (isDuplicateKeyError(err)) throw toError();
    throw err;
  }
};

/** A rejected account never gets a session, whichever way it arrives. */
export const assertNotRejected = (user: { status: string }) => {
  if (user.status === ACCOUNT_STATUS.REJECTED) {
    throw new AppError(403, 'ACCOUNT_REJECTED', 'Your account has been rejected or revoked.');
  }
};

export const registerUser = async ({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}): Promise<DeliveryResult> => {
  // Registration deliberately reveals duplicates (PRD §3)
  if (await User.exists({ email })) throw duplicateEmailError();

  const user = await mapDuplicateKey(
    User.create({ name, email, passwordHash: await hashPassword(password) }),
    duplicateEmailError
  );

  try {
    const token = await createEmailToken(user._id, 'verify-email');
    return await sendVerificationEmail(user.email, user.name, token);
  } catch (err) {
    // No unverifiable account may be left behind when the email could not go out
    await EmailToken.deleteMany({ user: user._id });
    await User.deleteOne({ _id: user._id });
    throw err;
  }
};

const markEmailVerified = async (token: ConsumedToken) => {
  // Returns the document as it was before the update
  const userBeforeUpdate = await User.findByIdAndUpdate(token.user, { emailVerified: true });
  if (!userBeforeUpdate) throw invalidTokenError();
  if (!userBeforeUpdate.emailVerified && userBeforeUpdate.status === ACCOUNT_STATUS.PENDING) {
    notifyAdminsAwaitingApproval(userBeforeUpdate).catch((err) => {
      console.error('Admin approval notice failed:', err instanceof Error ? err.message : 'unknown error');
    });
  }
};

// Attaches the chat only; confirming a Telegram link does not verify the email (PRD §3)
const attachTelegramChat = async (token: ConsumedToken) => {
  const chatId = token.telegramChatId;
  if (!chatId) throw invalidTokenError();
  // The chat may have been linked to another account since this link was emailed
  if (await User.exists({ telegramChatId: chatId, _id: { $ne: token.user } })) throw invalidTokenError();

  // An already linked, different chat is replaced
  const user = await mapDuplicateKey(User.findByIdAndUpdate(token.user, { telegramChatId: chatId }), invalidTokenError);
  if (!user) throw invalidTokenError();
};

/** Spends an emailed verify-email or link-telegram token and applies it. */
export const confirmEmailToken = async (raw: string): Promise<'verify-email' | 'link-telegram'> => {
  const token = await consumeEmailToken(raw, ['verify-email', 'link-telegram']);
  switch (token.type) {
    case 'verify-email':
      await markEmailVerified(token);
      return token.type;
    case 'link-telegram':
      await attachTelegramChat(token);
      return token.type;
    default:
      throw invalidTokenError();
  }
};

export const authenticate = async (email: string, password: string): Promise<UserDocument> => {
  const user = await User.findOne({ email });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !user.passwordHash || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  // Only reached with a correct password, so the status is not leaked to strangers
  assertNotRejected(user);
  return user;
};

/** Mails a fresh verification link; only the newest link works. */
const sendFreshVerification = async (user: UserDocument) => {
  await discardPendingTokens(user._id, 'verify-email');
  const token = await createEmailToken(user._id, 'verify-email');
  return sendTracked(user._id, 'verify-email', () => sendVerificationEmail(user.email, user.name, token));
};

/** Nothing is sent to an already verified user. */
export const resendVerification = async (user: UserDocument): Promise<DeliveryResult | undefined> =>
  user.emailVerified ? undefined : sendFreshVerification(user);

/** An unverified user fixes a typo in their address; the old verification link stops working. */
export const changeUnverifiedEmail = async (user: UserDocument, email: string): Promise<DeliveryResult> => {
  if (user.emailVerified) throw new ForbiddenError('Your email address is already verified.');

  if (email !== user.email) {
    if (await User.exists({ email })) throw duplicateEmailError();
    user.email = email;
    await mapDuplicateKey(user.save(), duplicateEmailError);
  }

  // A Telegram link mailed to the old address must not be confirmable from that mailbox
  await discardPendingTokens(user._id, 'link-telegram');
  return sendFreshVerification(user);
};

/** The background half of POST /forgot-password. Never throws: the caller already got its 204. */
export const issueResetLink = async (email: string) => {
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

/** Sets the password from an emailed reset link and signs out every device. */
export const resetPassword = async (rawToken: string, password: string) => {
  // Hash before spending the token, so a failure here cannot burn the user's only link
  const passwordHash = await hashPassword(password);
  const token = await consumeEmailToken(rawToken, ['reset-password']);

  // A password the user chose themselves also ends an admin-issued temporary one
  const user = await User.findByIdAndUpdate(token.user, { passwordHash, mustChangePassword: false });
  if (!user) throw invalidTokenError();
  await revokeAllUserTokens(String(user._id));
};

/**
 * Replaces the password after checking the current one and revokes every session; the caller issues a new one.
 * A wrong current password is 400, not 401, so the client does not try a refresh.
 */
export const changePassword = async (user: UserDocument, currentPassword: string, newPassword: string) => {
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Your current password is incorrect.');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  // Sign out every other device (they may hold the temporary password's sessions); the caller keeps this one
  await revokeAllUserTokens(String(user._id));
};
