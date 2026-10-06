import type { Request, Response, NextFunction } from 'express';
import { ACCOUNT_STATUS } from '@inventory/shared';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/jwt.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Verifies the access-token cookie and attaches req.user.
 * The user is re-read from the DB so role/status changes (e.g. a revoke) apply immediately.
 */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  // Express 5 forwards rejected promises from async middleware to the error handler
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) throw new UnauthorizedError('Authentication required');

  const userId = verifyAccessToken(token);
  const user = await User.findById(userId).select('role status');
  if (!user) throw new UnauthorizedError('User no longer exists');

  req.user = { id: String(user._id), role: user.role, status: user.status };
  next();
};

/** Blocks pending/rejected users from data routes. Use after requireAuth. */
export const requireActive = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new UnauthorizedError('Authentication required'));
  if (req.user.status !== ACCOUNT_STATUS.ACTIVE) {
    return next(new ForbiddenError('Account is not active'));
  }
  next();
};
