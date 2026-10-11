import type { UserRole } from '../constants/roles';
import type { AccountStatus } from '../constants/account-status';

/** Shape returned by GET /api/auth/me */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
}

/**
 * Present on mail-sending responses only outside production while mail is logged to the server
 * console (no SMTP configured): the link that was "sent", so a developer or test can open it.
 */
export interface DevMailResponse {
  devMailUrl?: string;
}

/** What a consumed emailed link did: confirmed the email, or linked a Telegram chat. */
export type EmailLinkType = 'verify-email' | 'link-telegram';

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
