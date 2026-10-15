import type { AuthUser, UserRole, AccountStatus } from '@inventory/shared';

interface UserLike {
  _id: unknown;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  mustChangePassword?: boolean | null;
  passwordHash?: string | null;
  telegramChatId?: string | null;
  telegramUsername?: string | null;
}

/** Shape returned by /auth/me and by login/refresh. */
export const toAuthUser = (user: UserLike): AuthUser => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
  mustChangePassword: Boolean(user.mustChangePassword),
  hasPassword: Boolean(user.passwordHash),
  telegramLinked: Boolean(user.telegramChatId),
  telegramUsername: user.telegramChatId ? (user.telegramUsername ?? null) : null,
});
