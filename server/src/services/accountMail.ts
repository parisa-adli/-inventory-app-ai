import type { Types } from 'mongoose';
import { ACCOUNT_STATUS, USER_ROLES, type EmailTokenType } from '@inventory/shared';
import { User } from '../models/User.js';
import { pendingUsersUrl, sendUserAwaitingApprovalEmail } from './email.js';

/**
 * Runs a send and records the outcome on the user: a failure sets lastEmailFailedAt/Type,
 * the next successful send clears them. The original error is rethrown.
 */
export const sendTracked = async <T>(
  userId: Types.ObjectId | string,
  type: EmailTokenType,
  send: () => Promise<T>
): Promise<T> => {
  try {
    const result = await send();
    await User.updateOne(
      { _id: userId, lastEmailFailedAt: { $exists: true } },
      { $unset: { lastEmailFailedAt: 1, lastEmailFailedType: 1 } }
    );
    return result;
  } catch (err) {
    await User.updateOne({ _id: userId }, { lastEmailFailedAt: new Date(), lastEmailFailedType: type }).catch(
      () => {}
    );
    throw err;
  }
};

/** Tells every active admin that a user can now be approved. Callers fire and forget; one failed mail does not stop the rest. */
export const notifyAdminsAwaitingApproval = async (user: { name: string; email: string }): Promise<void> => {
  const admins = await User.find({ role: USER_ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE });
  await Promise.allSettled(
    admins.map((admin) =>
      sendUserAwaitingApprovalEmail({
        to: admin.email,
        adminName: admin.name,
        userName: user.name,
        userEmail: user.email,
        url: pendingUsersUrl(),
      })
    )
  );
};
