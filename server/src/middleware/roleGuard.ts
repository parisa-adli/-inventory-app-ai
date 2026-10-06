import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@inventory/shared';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/** Role check for mutating routes. Use after requireAuth. */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }
    next();
  };
};
