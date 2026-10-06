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
