import type { Request, Response, NextFunction } from 'express';
import { ACCOUNT_STATUS } from '@inventory/shared';
import { AccessGateError, UnauthorizedError } from '../utils/errors.js';

/** 403 ACCOUNT_PENDING / ACCOUNT_REJECTED unless an admin has activated the account. Use after requireAuth. */
export const requireActive = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new UnauthorizedError('Authentication required'));
  if (req.user.status === ACCOUNT_STATUS.PENDING) {
    return next(new AccessGateError('ACCOUNT_PENDING', 'Your account is awaiting approval.'));
  }
  if (req.user.status !== ACCOUNT_STATUS.ACTIVE) {
    return next(new AccessGateError('ACCOUNT_REJECTED', 'Your account has been rejected or revoked.'));
  }
  next();
};
