import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

/** The signed-in user behind the access-token cookie, or UnauthorizedError. */
const userFromAccessCookie = async (req: Request) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) throw new UnauthorizedError('Authentication required');

  const { userId, issuedAt } = verifyAccessToken(token);
  const user = await User.findById(userId).select('role status emailVerified mustChangePassword sessionsValidAfter');
  if (!user) throw new UnauthorizedError('User no longer exists');
  // Sign out everywhere, a password change or reset... ended this session
  if (user.sessionsValidAfter && issuedAt < user.sessionsValidAfter.getTime()) {
    throw new UnauthorizedError('Session ended');
  }
  return user;
};

/**
 * Verifies the access-token cookie and attaches req.user.
 * The user is re-read from the DB on every request, so a rejection, a demotion or a temporary
 * password applies on the next request instead of when the 15-minute access token expires.
 */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  // Express 5 forwards rejected promises from async middleware to the error handler
  const user = await userFromAccessCookie(req);
  req.user = {
    id: String(user._id),
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
  next();
};
