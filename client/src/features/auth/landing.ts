import { ACCOUNT_STATUS, type AuthUser } from '@inventory/shared';

/**
 * Where a logged-in user belongs. The first gate that applies wins: an unverified email, then a
 * rejected account, then a pending one (so a rejected user who never verified still lands on verify).
 */
export const resolveLandingRoute = (user: AuthUser, from?: string): string => {
  if (!user.emailVerified) return '/verify-email';
  if (user.status === ACCOUNT_STATUS.REJECTED) return '/rejected';
  if (user.status === ACCOUNT_STATUS.PENDING) return '/awaiting-approval';
  return from ?? '/';
};
