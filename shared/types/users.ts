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
