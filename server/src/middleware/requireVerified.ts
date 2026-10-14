import type { Request, Response, NextFunction } from 'express';
import { AccessGateError, UnauthorizedError } from '../utils/errors.js';

/** 403 EMAIL_UNVERIFIED until the user confirms their email. Use after requireAuth. */
export const requireVerified = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new UnauthorizedError('Authentication required'));
  if (!req.user.emailVerified) {
    return next(new AccessGateError('EMAIL_UNVERIFIED', 'Verify your email address first.'));
  }
  next();
};
