import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * Verifies the access-token cookie and attaches req.user.
 * The user is re-read from the DB on every request, so a rejection, a demotion or a temporary
 * password applies on the next request instead of when the 15-minute access token expires.
 */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  // Express 5 forwards rejected promises from async middleware to the error handler
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) throw new UnauthorizedError('Authentication required');

  const userId = verifyAccessToken(token);
  const user = await User.findById(userId).select('role status emailVerified mustChangePassword');
  if (!user) throw new UnauthorizedError('User no longer exists');

  req.user = {
    id: String(user._id),
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
  next();
};
