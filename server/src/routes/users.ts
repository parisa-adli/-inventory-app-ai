import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { ACCOUNT_STATUS, PERMISSIONS, listUsersQuerySchema, updateUserSchema } from '@inventory/shared';
import type { TempPasswordResponse } from '@inventory/shared';
import { can } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { User } from '../models/User.js';
import {
  issueTemporaryPassword,
  listUsers,
  resendVerificationFor,
  toAdminUser,
  updateUser,
  verifyEmailManually,
} from '../services/userAdmin.js';
import { unlinkTelegram } from '../services/signInMethods.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

const router = Router();

// Admin user management. requireAuth re-reads the user, so a demoted, rejected or revoked admin
// loses access on the next request. The rules live in services/userAdmin.ts.
router.use(...can(PERMISSIONS.USERS_MANAGE));

const parseId = (raw: string): string => {
  if (!isValidObjectId(raw)) throw new ValidationError('Invalid user id');
  return raw;
};

const actorId = (req: { user?: { id: string } }) => req.user!.id;

router.get('/', async (req, res) => {
  res.json(await listUsers(listUsersQuerySchema.parse(req.query)));
});

router.patch('/:id', validate(updateUserSchema), async (req, res) => {
  const user = await updateUser(actorId(req), parseId(String(req.params.id)), req.body);
  res.json(toAdminUser(user));
});

router.post('/:id/password/temp', async (req, res) => {
  const temporaryPassword = await issueTemporaryPassword(parseId(String(req.params.id)));
  // Shown once: no cache may keep it
  res.set('Cache-Control', 'no-store');
  const body: TempPasswordResponse = { temporaryPassword };
  res.json(body);
});

router.post('/:id/email/verify-manually', async (req, res) => {
  res.json(toAdminUser(await verifyEmailManually(parseId(String(req.params.id)))));
});

router.post('/:id/email/verify/resend', async (req, res) => {
  const sent = await resendVerificationFor(parseId(String(req.params.id)));
  res.json(sent.devMailUrl ? { devMailUrl: sent.devMailUrl } : {});
});

// 409 LAST_SIGN_IN_METHOD for a user without a password: issue a temporary password first
router.delete('/:id/credentials/telegram', async (req, res) => {
  res.json(toAdminUser(await unlinkTelegram(parseId(String(req.params.id)))));
});

// The original single-purpose routes, kept for the shipped Admin Users page. They keep their own
// error codes for "wrong starting status" and self-revoke, then run the same rules as PATCH /:id.

const currentStatus = async (id: string) => {
  const user = await User.findById(id).select('status');
  if (!user) throw new NotFoundError('User not found');
  return user.status;
};

router.patch('/:id/activate', async (req, res) => {
  const id = parseId(String(req.params.id));
  const status = await currentStatus(id);
  if (status !== ACCOUNT_STATUS.PENDING) {
    throw new AppError(409, 'NOT_PENDING', `Only pending users can be activated (this user is ${status}).`);
  }
  res.json(toAdminUser(await updateUser(actorId(req), id, { status: ACCOUNT_STATUS.ACTIVE })));
});

// Rejecting a pending user and revoking an active one are the same transition (-> rejected)
router.patch('/:id/reject', async (req, res) => {
  const id = parseId(String(req.params.id));
  // An admin who locked themselves out could not undo it
  if (id === actorId(req)) {
    throw new AppError(409, 'CANNOT_REVOKE_SELF', 'You cannot revoke your own account.');
  }
  const status = await currentStatus(id);
  if (status === ACCOUNT_STATUS.REJECTED) {
    throw new AppError(409, 'NOT_ACTIVE_OR_PENDING', `This user is already ${status}.`);
  }
  res.json(toAdminUser(await updateUser(actorId(req), id, { status: ACCOUNT_STATUS.REJECTED })));
});

router.patch('/:id/reactivate', async (req, res) => {
  const id = parseId(String(req.params.id));
  const status = await currentStatus(id);
  if (status !== ACCOUNT_STATUS.REJECTED) {
    throw new AppError(409, 'NOT_REJECTED', `Only rejected users can be reactivated (this user is ${status}).`);
  }
  res.json(toAdminUser(await updateUser(actorId(req), id, { status: ACCOUNT_STATUS.ACTIVE })));
});

export default router;
