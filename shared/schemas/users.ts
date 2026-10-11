import { z } from 'zod';
import { ACCOUNT_STATUS } from '../constants/account-status';

export const USERS_PAGE_SIZE_DEFAULT = 10;
export const USERS_PAGE_SIZE_MAX = 100;

/** Query string of GET /api/users. Values arrive as strings, so numbers are coerced. */
export const listUsersQuerySchema = z.object({
  status: z.enum([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.REJECTED]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(USERS_PAGE_SIZE_MAX).default(USERS_PAGE_SIZE_DEFAULT),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
