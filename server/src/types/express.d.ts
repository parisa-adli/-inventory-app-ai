import type { UserRole, AccountStatus } from '@inventory/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        status: AccountStatus;
      };
    }
  }
}

export {};
