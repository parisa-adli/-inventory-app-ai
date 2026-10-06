import jwt, { type SignOptions } from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { UnauthorizedError } from '../utils/errors.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Parses "15m" / "7d" style durations into milliseconds. */
export const durationToMs = (value: string): number => {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration "${value}" (expected e.g. 15m, 7d)`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
};

interface TokenPayload {
  sub: string;
}

export const signAccessToken = (userId: string): string =>
  jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as SignOptions);

/** Returns the user id, or throws UnauthorizedError for any invalid/expired token. */
export const verifyAccessToken = (token: string): string => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    return payload.sub;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
};

const cookieOptions = (maxAgeMs: number, path = '/'): CookieOptions => ({
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path,
  maxAge: maxAgeMs,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const clearAuthCookies = (res: Response): void => {
  const base = { ...cookieOptions(0), maxAge: undefined };
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
};

/** Issues an access + refresh pair as httpOnly cookies and persists the refresh token's hash. */
export const issueSession = async (
  res: Response,
  user: { _id: Types.ObjectId | string }
): Promise<void> => {
  const userId = String(user._id);
  const refreshMs = durationToMs(env.REFRESH_TOKEN_TTL);

  const refreshToken = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject: userId,
    jwtid: randomToken(16), // guarantees a unique token (and hash) per issue
    expiresIn: env.REFRESH_TOKEN_TTL,
  } as SignOptions);

  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + refreshMs),
  });

  res.cookie(ACCESS_COOKIE, signAccessToken(userId), cookieOptions(durationToMs(env.ACCESS_TOKEN_TTL)));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(refreshMs, REFRESH_COOKIE_PATH));
};

/**
 * Validates and consumes a refresh token, then issues a fresh pair.
 * Presenting an already-revoked token is treated as theft: all of that user's tokens are revoked.
 */
export const rotateRefreshToken = async (rawToken: string, res: Response) => {
  let userId: string;
  try {
    userId = (jwt.verify(rawToken, env.JWT_REFRESH_SECRET) as TokenPayload).sub;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Atomic claim: only one concurrent request can flip revoked false -> true
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash: sha256(rawToken), revoked: false, expiresAt: { $gt: new Date() } },
    { revoked: true }
  );

  if (!claimed) {
    const known = await RefreshToken.exists({ tokenHash: sha256(rawToken) });
    if (known) await RefreshToken.updateMany({ user: userId }, { revoked: true });
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError('User no longer exists');

  await issueSession(res, user);
  return user;
};

export const revokeRefreshToken = async (rawToken: string): Promise<void> => {
  await RefreshToken.updateOne({ tokenHash: sha256(rawToken) }, { revoked: true });
};

export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  await RefreshToken.updateMany({ user: userId }, { revoked: true });
};
