import { z } from 'zod';

/**
 * `page` / `limit` of every paginated list query, spread into its `z.object`. Values arrive as strings.
 * Each feature keeps its own page size constants: the defaults differ.
 */
export const paginationFields = (defaultLimit: number, maxLimit: number) => ({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
});
