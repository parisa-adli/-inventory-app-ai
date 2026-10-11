import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { ACCOUNT_STATUS, USER_ROLES, listUsersQuerySchema } from '@inventory/shared';
import type { AdminUser, UsersPage } from '@inventory/shared';
import { requireActive, requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { User } from '../models/User.js';
import { revokeAllUserTokens } from '../services/jwt.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

const router = Router();

// Admin user management. requireAuth re-reads the user, so a demoted, rejected or revoked admin
// loses access on the next request.
router.use(requireAuth, requireActive, requireRole(USER_ROLES.ADMIN));

interface UserLike {
  _id: unknown;
  name: string;
  email: string;
  role: AdminUser['role'];
  status: AdminUser['status'];
  emailVerified: boolean;
  telegramChatId?: string | null;
  createdAt: Date;
}

const toAdminUser = (user: UserLike): AdminUser => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
  telegramLinked: Boolean(user.telegramChatId),
  createdAt: user.createdAt.toISOString(),
});

const parseId = (raw: string): string => {
  if (!isValidObjectId(raw)) throw new ValidationError('Invalid user id');
  return raw;
};

router.get('/', async (req, res) => {
  const { status, page, limit } = listUsersQuerySchema.parse(req.query);
  const filter = status ? { status } : {};

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  const body: UsersPage = {
    items: users.map(toAdminUser),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
  res.json(body);
});

/** Why a pending-only transition matched nothing: no such user, or the user is no longer pending. */
const explainRefusal = async (id: string, action: string): Promise<AppError> => {
  const user = await User.findById(id).select('status');
  if (!user) return new NotFoundError('User not found');
  return new AppError(409, 'NOT_PENDING', `Only pending users can be ${action} (this user is ${user.status}).`);
};

router.patch('/:id/activate', async (req, res) => {
  const id = parseId(req.params.id);

  // One conditional update, so two admins clicking at once cannot both "win" and a user whose
  // email is not verified is never activated, whatever the client sent.
  const user = await User.findOneAndUpdate(
    { _id: id, status: ACCOUNT_STATUS.PENDING, emailVerified: true },
    { status: ACCOUNT_STATUS.ACTIVE },
    { returnDocument: 'after' }
  );
  if (user) return res.json(toAdminUser(user));

  const existing = await User.findById(id).select('status emailVerified');
  if (existing?.status === ACCOUNT_STATUS.PENDING && !existing.emailVerified) {
    throw new AppError(400, 'EMAIL_NOT_VERIFIED', 'This user has not verified their email address yet.');
  }
  throw await explainRefusal(id, 'activated');
});

router.patch('/:id/reject', async (req, res) => {
  const id = parseId(req.params.id);

  const user = await User.findOneAndUpdate(
    { _id: id, status: ACCOUNT_STATUS.PENDING },
    { status: ACCOUNT_STATUS.REJECTED },
    { returnDocument: 'after' }
  );
  if (!user) throw await explainRefusal(id, 'rejected');

  // A pending user may already hold a session; end it so it cannot be refreshed
  await revokeAllUserTokens(id);
  res.json(toAdminUser(user));
});

export default router;
