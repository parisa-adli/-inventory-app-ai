import type { PipelineStage, Types } from 'mongoose';
import { ACCOUNT_STATUS, USER_ROLES, defaultSortOrder } from '@inventory/shared';
import type { AdminUser, ListUsersQuery, UpdateUserInput, UsersPage } from '@inventory/shared';
import { User } from '../models/User.js';
import { sendTracked } from './accountMail.js';
import { assertEmailAvailable, sendVerificationEmail, type DeliveryResult } from './email.js';
import { createEmailToken, discardPendingTokens } from './emailToken.js';
import { endAllSessions, revokeAllUserTokens } from './jwt.js';
import { hashPassword } from './password.js';
import { randomPassword } from '../utils/crypto.js';
import { NAME_COLLATION, escapeRegex } from '../utils/text.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

/** A User document or an aggregate row: the fields the admin view needs. */
interface UserLike {
  _id: unknown;
  name: string;
  email: string;
  role: AdminUser['role'];
  status: AdminUser['status'];
  emailVerified: boolean;
  telegramChatId?: string | null;
  mustChangePassword?: boolean | null;
  statusReason?: string | null;
  statusChangedAt?: Date | null;
  statusChangedBy?: Types.ObjectId | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

export const toAdminUser = (user: UserLike): AdminUser => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
  telegramLinked: Boolean(user.telegramChatId),
  mustChangePassword: Boolean(user.mustChangePassword),
  statusReason: user.statusReason ?? null,
  statusChangedAt: user.statusChangedAt ? user.statusChangedAt.toISOString() : null,
  statusChangedBy: user.statusChangedBy ? String(user.statusChangedBy) : null,
  lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  createdAt: user.createdAt.toISOString(),
});

const findUserOrThrow = async (id: string) => {
  const user = await User.findById(id);
  if (!user) throw new NotFoundError('User not found');
  return user;
};

export const emailNotVerifiedError = () =>
  new AppError(400, 'EMAIL_NOT_VERIFIED', 'This user has not verified their email address yet.');

// Contract has no specific codes for these yet; proposed CANNOT_MODIFY_SELF and LAST_ADMIN (CONTRACT-CHANGES C11)
const selfActionError = () => new ForbiddenError('You cannot reject or demote your own account.');
const lastAdminError = () => new ForbiddenError('At least one active admin must remain.');

/**
 * GET /api/users: filters, then the requested sort (newest first by default) with an `_id` tie-break.
 * By last sign-in, accounts that never signed in come last in both directions.
 */
export const listUsers = async (query: ListUsersQuery): Promise<UsersPage> => {
  const { status, role, verified, search, page, limit, sort } = query;
  const direction = (query.order ?? defaultSortOrder(sort)) === 'asc' ? 1 : -1;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (verified !== undefined) filter.emailVerified = verified;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const neverSignedInLast = sort === 'lastLoginAt';
  const pipeline: PipelineStage[] = [
    { $match: filter },
    ...(neverSignedInLast
      ? [{ $addFields: { neverSignedIn: { $eq: [{ $ifNull: ['$lastLoginAt', null] }, null] } } }]
      : []),
    { $sort: { ...(neverSignedInLast ? { neverSignedIn: 1 } : {}), [sort]: direction, _id: direction } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ];

  const [total, users] = await Promise.all([User.countDocuments(filter), User.aggregate<UserLike>(pipeline).collation(NAME_COLLATION)]);
  return {
    items: users.map(toAdminUser),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

const countActiveAdmins = () => User.countDocuments({ role: USER_ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE });

/**
 * PATCH /api/users/:id and the activate/reject/reactivate routes. Every rule is enforced here:
 * - activating (from pending or rejected) needs a verified email;
 * - an admin cannot reject or demote themselves;
 * - the last active admin cannot be demoted or rejected;
 * - a rejection revokes every refresh token and records reason, time and admin;
 * - a rejection never touches `role`, so reinstating restores the role the user had.
 */
export const updateUser = async (actorId: string, targetId: string, patch: UpdateUserInput) => {
  const target = await findUserOrThrow(targetId);

  const nextRole = patch.role ?? target.role;
  const nextStatus = patch.status ?? target.status;
  const statusChanges = nextStatus !== target.status;
  const demotes = target.role === USER_ROLES.ADMIN && nextRole !== USER_ROLES.ADMIN;
  const rejects = statusChanges && nextStatus === ACCOUNT_STATUS.REJECTED;

  if (targetId === actorId && (demotes || rejects)) throw selfActionError();
  if (statusChanges && nextStatus === ACCOUNT_STATUS.ACTIVE && !target.emailVerified) throw emailNotVerifiedError();

  const removesActiveAdmin = target.role === USER_ROLES.ADMIN && target.status === ACCOUNT_STATUS.ACTIVE && (demotes || rejects);
  if (removesActiveAdmin && (await countActiveAdmins()) <= 1) throw lastAdminError();

  const set: Record<string, unknown> = { role: nextRole };
  const unset: Record<string, 1> = {};
  if (statusChanges) {
    set.status = nextStatus;
    set.statusChangedAt = new Date();
    set.statusChangedBy = actorId;
    if (rejects && patch.statusReason) set.statusReason = patch.statusReason;
    else unset.statusReason = 1;
  } else if (nextStatus === ACCOUNT_STATUS.REJECTED && patch.statusReason !== undefined) {
    // Already rejected: the admin only corrects the reason
    set.statusReason = patch.statusReason;
  }

  // Optimistic check: the role/status the rules above were checked against must still be current,
  // and an activation must still find a verified email.
  const guard: Record<string, unknown> = { _id: targetId, role: target.role, status: target.status };
  if (statusChanges && nextStatus === ACCOUNT_STATUS.ACTIVE) guard.emailVerified = true;
  const updated = await User.findOneAndUpdate(
    guard,
    Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
    { returnDocument: 'after' }
  );
  if (!updated) throw new ConflictError('This user was changed by someone else. Reload and try again.');

  // Two admins demoting each other at the same moment would both pass the count above; whoever
  // finds no active admin left afterwards puts their target back.
  if (removesActiveAdmin && (await countActiveAdmins()) === 0) {
    const previous = {
      role: target.role,
      status: target.status,
      statusReason: target.statusReason,
      statusChangedAt: target.statusChangedAt,
      statusChangedBy: target.statusChangedBy,
    };
    const restore: Record<string, unknown> = {};
    const clear: Record<string, 1> = {};
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined || value === null) clear[key] = 1;
      else restore[key] = value;
    }
    await User.updateOne({ _id: targetId }, Object.keys(clear).length ? { $set: restore, $unset: clear } : { $set: restore });
    throw lastAdminError();
  }

  // Their access token already stops working on data routes on the next request (requireAuth re-reads the
  // status) but still reaches /me, so the browser shows the rejected screen; revoking the refresh tokens
  // stops the session from being renewed. Hence revokeAllUserTokens here, not endAllSessions.
  if (rejects) await revokeAllUserTokens(targetId);
  return updated;
};

/**
 * POST /api/users/:id/password/temp. The plain password is returned to the caller once and never
 * stored or logged; the user must replace it before any guarded route works again.
 */
export const issueTemporaryPassword = async (targetId: string): Promise<string> => {
  await findUserOrThrow(targetId);
  const temporaryPassword = randomPassword();
  await User.updateOne(
    { _id: targetId },
    { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true }
  );
  // Whoever held the old password (or a session from it) is signed out
  await endAllSessions(targetId);
  return temporaryPassword;
};

/** POST /api/users/:id/email/verify-manually. Idempotent; outstanding verification links stop working. */
export const verifyEmailManually = async (targetId: string) => {
  const user = await User.findByIdAndUpdate(targetId, { emailVerified: true }, { returnDocument: 'after' });
  if (!user) throw new NotFoundError('User not found');
  await discardPendingTokens(user._id, 'verify-email');
  return user;
};

/** POST /api/users/:id/email/verify/resend. Same mail and tracking as the user's own resend. */
export const resendVerificationFor = async (targetId: string): Promise<DeliveryResult> => {
  assertEmailAvailable();
  const user = await findUserOrThrow(targetId);
  if (user.emailVerified) throw new ConflictError('This email address is already verified.');

  await discardPendingTokens(user._id, 'verify-email');
  const token = await createEmailToken(user._id, 'verify-email');
  return sendTracked(user._id, 'verify-email', () => sendVerificationEmail(user.email, user.name, token));
};
