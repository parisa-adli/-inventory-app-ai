import type { UserRole } from '../constants/roles';
import type { AccountStatus } from '../constants/account-status';
import type { EmailTokenType } from '../constants/email-token-types';

/** Shape returned by GET /api/auth/me */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  /** Signed in with an admin-issued temporary password: only POST /api/auth/password and logout work. */
  mustChangePassword: boolean;
  /** False for a Telegram-only account (it can add one on the Profile page). */
  hasPassword: boolean;
  telegramLinked: boolean;
  /** Telegram handle without the "@"; null when unlinked or the Telegram account has none. */
  telegramUsername: string | null;
}

/** One signed-in browser (a refresh-token family), as listed on the Profile page. */
export interface DeviceSession {
  id: string;
  /** e.g. "Chrome on Windows", or "Unknown device". */
  device: string;
  ip: string | null;
  signedInAt: string;
  lastActiveAt: string;
  /** The browser that asked. */
  current: boolean;
}

/** GET /api/auth/sessions: live sessions only, the current one first, then most recently active. */
export interface SessionsResponse {
  items: DeviceSession[];
}

/**
 * Present on mail-sending responses only outside production while mail is logged to the server
 * console (no SMTP configured): the link that was "sent", so a developer or test can open it.
 */
export interface DevMailResponse {
  devMailUrl?: string;
}

/** What a consumed emailed link did: confirmed the email, or linked a Telegram chat. */
export type EmailLinkType = Exclude<EmailTokenType, 'reset-password'>;

/** GET /api/auth/verify-email/:token. Never returns the user: the token is the only proof. */
export interface VerifyEmailResponse {
  verified: true;
  type: EmailLinkType;
}

/** POST /api/auth/register */
export interface RegisterResponse extends DevMailResponse {
  message: string;
}

/** PATCH /api/auth/email */
export interface ChangeEmailResponse extends DevMailResponse {
  user: AuthUser;
}

/** `error.details` of a 429 RATE_LIMITED response. */
export interface RateLimitedDetails {
  /** Seconds until the caller may try again; also sent as the Retry-After header. */
  retryAfter: number;
}
