import type { Request, Response, NextFunction } from 'express';
import { hasPermission, type Permission } from '@inventory/shared';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/** 403 FORBIDDEN unless the user's role grants every one of `permissions`. Use after requireAuth. */
export const requirePermission = (...permissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    const { role } = req.user;
    if (!permissions.every((permission) => hasPermission(role, permission))) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }
    next();
  };
};
