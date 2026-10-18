import { z } from 'zod';
import { SORT_ORDERS } from './sort';

// Shared by the category and supplier schemas (and later products): list query and optional text fields.

export const CATALOG_PAGE_SIZE_DEFAULT = 12;
export const CATALOG_PAGE_SIZE_MAX = 100;
export const CATALOG_SEARCH_MAX = 100;

/** `name` is the record's title on categories. */
export const CATALOG_SORTS = ['name', 'createdAt', 'productCount'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Query string of GET /api/categories and GET /api/suppliers. Values arrive as strings. */
export const catalogListQuerySchema = z.object({
  /** Case-insensitive substring; an empty string means no search. */
  search: z.string().trim().max(CATALOG_SEARCH_MAX).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(CATALOG_PAGE_SIZE_MAX).default(CATALOG_PAGE_SIZE_DEFAULT),
  /** Newest first by default. */
  sort: z.enum(CATALOG_SORTS).default('createdAt'),
  /** Defaults to `defaultSortOrder(sort)`. */
  order: z.enum(SORT_ORDERS).optional(),
});

export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;
export type CatalogListParams = z.input<typeof catalogListQuerySchema>;

/** A MongoDB ObjectId sent as a reference (a category, supplier or product id). */
export const objectId = (message: string) => z.string().regex(/^[a-f\d]{24}$/i, message);

/** A required, trimmed text field. */
export const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

/**
 * An optional, trimmed text field as the API sees it: when present it is not empty. Create omits empty
 * fields; update sends `null` to clear one (only the update schemas add `.nullable()`).
 */
export const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} cannot be empty; leave it out or send null to clear it`)
    .max(max, `${label} must be at most ${max} characters`);

/** The form version of an optional field: an empty input is allowed and means "no value". */
export const formField = <T extends z.ZodType<string, string>>(field: T) =>
  z.string().trim().pipe(z.union([z.literal(''), field]));
