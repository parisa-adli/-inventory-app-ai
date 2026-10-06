import type { AuthUser, UserRole, AccountStatus } from '@inventory/shared';

interface UserLike {
  _id: unknown;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
}

/** Shape returned by /auth/me and by login/refresh. */
export const toAuthUser = (user: UserLike): AuthUser => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
});
