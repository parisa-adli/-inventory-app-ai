import { z } from 'zod';
import { ACCOUNT_STATUS } from '../constants/account-status';
import { USER_ROLES } from '../constants/roles';
import { SORT_ORDERS, type SortOrder } from './catalog';

export const USERS_PAGE_SIZE_DEFAULT = 20;
export const USERS_PAGE_SIZE_MAX = 100;
export const USER_SEARCH_MAX = 100;
export const STATUS_REASON_MAX = 500;

const roleField = z.enum([USER_ROLES.ADMIN, USER_ROLES.STAFF]);

export const USER_SORTS = ['createdAt', 'name', 'lastLoginAt'] as const;
export type UserSort = (typeof USER_SORTS)[number];

/** Order used when the query names a sort but no order: A→Z for names, newest first otherwise. */
export const defaultUserSortOrder = (sort: UserSort): SortOrder => (sort === 'name' ? 'asc' : 'desc');

/** Query string of GET /api/users. Values arrive as strings, so numbers and booleans are coerced. */
export const listUsersQuerySchema = z.object({
  status: z.enum([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.REJECTED]).optional(),
  role: roleField.optional(),
  /** `verified=true|false` filters on emailVerified. */
  verified: z.stringbool().optional(),
  /** Case-insensitive substring of the name or email. */
  search: z.string().trim().max(USER_SEARCH_MAX).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(USERS_PAGE_SIZE_MAX).default(USERS_PAGE_SIZE_DEFAULT),
  /** Newest first by default. */
  sort: z.enum(USER_SORTS).default('createdAt'),
  /** Defaults to `defaultUserSortOrder(sort)`. */
  order: z.enum(SORT_ORDERS).optional(),
});

/**
 * Body of PATCH /api/users/:id. `pending` is not a target: an account leaves it once.
 * `statusReason` is recorded on a rejection (optional).
 */
export const updateUserSchema = z
  .object({
    role: roleField.optional(),
    status: z.enum([ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.REJECTED]).optional(),
    statusReason: z.string().trim().max(STATUS_REASON_MAX).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    error: 'Send a role or a status',
  });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
