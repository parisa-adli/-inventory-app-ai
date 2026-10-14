import type { AccountStatus } from '../constants/account-status';
import type { UserRole } from '../constants/roles';

/** A user as the admin Users page sees it. Never includes credentials. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  /** Whether a Telegram chat is linked. The chat id itself stays on the server. */
  telegramLinked: boolean;
  /** Set by an admin's temporary password; cleared when the user picks their own. */
  mustChangePassword: boolean;
  /** Why the account was rejected; null when none was given or the account is not rejected. */
  statusReason: string | null;
  /** When and by which admin (user id) the status last changed; null if never changed by an admin. */
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
}

/** GET /api/users */
export interface UsersPage {
  items: AdminUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** POST /api/users/:id/password/temp. Returned once; the server keeps only the hash. */
export interface TempPasswordResponse {
  temporaryPassword: string;
}
