import type { Request, Response, NextFunction } from 'express';
import { AccessGateError, UnauthorizedError } from '../utils/errors.js';

/**
 * 403 PASSWORD_CHANGE_REQUIRED while the user is on an admin-issued temporary password.
 * POST /api/auth/password and logout never run this guard, so the user can always get out of it.
 */
export const requirePasswordChanged = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new UnauthorizedError('Authentication required'));
  if (req.user.mustChangePassword) {
    return next(new AccessGateError('PASSWORD_CHANGE_REQUIRED', 'Choose a new password to continue.'));
  }
  next();
};
