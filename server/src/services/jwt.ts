import jwt, { type SignOptions } from 'jsonwebtoken';
import type { CookieOptions, Request, Response } from 'express';
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
  iat: number;
  /** Issue time in milliseconds; `iat` has only seconds, too coarse to compare with `sessionsValidAfter`. */
  ts?: number;
}

export const signAccessToken = (userId: string): string =>
  jwt.sign({ ts: Date.now() }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as SignOptions);

export interface AccessTokenClaims {
  userId: string;
  /** Milliseconds; compared with `User.sessionsValidAfter`. */
  issuedAt: number;
}

/** Throws UnauthorizedError for any invalid/expired token. */
export const verifyAccessToken = (token: string): AccessTokenClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    return { userId: payload.sub, issuedAt: payload.ts ?? payload.iat * 1000 };
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

/** The Session a refresh token belongs to (CONTEXT.md): one browser, from sign in to sign out. */
interface SessionFamily {
  familyId: string;
  familyCreatedAt: Date;
  /** Kept when a refresh request does not say (no User-Agent header). */
  userAgent?: string | null;
  ip?: string | null;
}

const USER_AGENT_MAX = 512;

/**
 * Issues an access + refresh pair as httpOnly cookies and persists the refresh token's hash.
 * Without `family` this is a sign in, so a new Session starts; a refresh passes the family it continues.
 */
export const issueSession = async (
  req: Request,
  res: Response,
  user: { _id: Types.ObjectId | string },
  family?: SessionFamily
): Promise<string> => {
  const userId = String(user._id);
  const refreshMs = durationToMs(env.REFRESH_TOKEN_TTL);
  const now = new Date();

  const refreshToken = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject: userId,
    jwtid: randomToken(16), // guarantees a unique token (and hash) per issue
    expiresIn: env.REFRESH_TOKEN_TTL,
  } as SignOptions);

  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(now.getTime() + refreshMs),
    familyId: family?.familyId ?? randomToken(16),
    familyCreatedAt: family?.familyCreatedAt ?? now,
    lastUsedAt: now,
    userAgent: req.get('user-agent')?.slice(0, USER_AGENT_MAX) ?? family?.userAgent ?? undefined,
    // Honours TRUST_PROXY (app.set('trust proxy')); deleted with the token by the TTL index
    ip: req.ip ?? family?.ip ?? undefined,
  });

  res.cookie(ACCESS_COOKIE, signAccessToken(userId), cookieOptions(durationToMs(env.ACCESS_TOKEN_TTL)));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(refreshMs, REFRESH_COOKIE_PATH));
  return refreshToken;
};

/**
 * Validates and consumes a refresh token, then issues a fresh pair.
 * Presenting an already-revoked token is treated as theft: all of that user's tokens are revoked.
 */
export const rotateRefreshToken = async (rawToken: string, req: Request, res: Response) => {
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
    if (known) await endAllSessions(userId);
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await User.findById(userId);
  if (!user) throw new UnauthorizedError('User no longer exists');
  // A token from before the sessions were ended never renews, even if it escaped the revocation
  const endedSince = (cutoff?: Date | null) => !!cutoff && claimed.createdAt < cutoff;
  if (endedSince(user.sessionsValidAfter)) throw new UnauthorizedError('Session ended');

  // Same Session; tokens from before families existed become the family they start
  const issued = await issueSession(req, res, user, {
    familyId: claimed.familyId ?? String(claimed._id),
    familyCreatedAt: claimed.familyCreatedAt ?? claimed.createdAt,
    userAgent: claimed.userAgent,
    ip: claimed.ip,
  });

  // endAllSessions may have run meanwhile: it sets the cutoff before revoking, so either its revocation
  // caught the new token or the cutoff is visible now
  const after = await User.findById(userId).select('sessionsValidAfter');
  if (endedSince(after?.sessionsValidAfter)) {
    await revokeRefreshToken(issued);
    throw new UnauthorizedError('Session ended');
  }
  return user;
};

export const revokeRefreshToken = async (rawToken: string): Promise<void> => {
  await RefreshToken.updateOne({ tokenHash: sha256(rawToken) }, { revoked: true });
};

/** No refresh token of the user renews any more; access tokens run out on their own (at most 15 minutes). */
export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  await RefreshToken.updateMany({ user: userId }, { revoked: true });
};

/**
 * Ends every Session of a user now: no refresh token renews, and access tokens issued before now stop
 * working on their next request (requireAuth checks `sessionsValidAfter`) instead of when they expire.
 */
export const endAllSessions = async (userId: string): Promise<void> => {
  await User.updateOne({ _id: userId }, { sessionsValidAfter: new Date() });
  await revokeAllUserTokens(userId);
};
