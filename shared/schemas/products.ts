import { z } from 'zod';
import { UNITS_OF_MEASURE } from '../constants/units';
import { formField, requiredText } from './catalog';

export const PRODUCT_TITLE_MAX = 120;
export const PRODUCT_SKU_MAX = 32;
export const PRODUCT_IMAGE_URL_MAX = 2048;
export const PRODUCTS_PAGE_SIZE_DEFAULT = 20;
export const PRODUCTS_PAGE_SIZE_MAX = 100;

const title = requiredText('Title', PRODUCT_TITLE_MAX);

/** Stored trimmed and upper-cased, so `ele-001 ` and `ELE-001` are the same SKU. */
const sku = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'SKU is required')
  .max(PRODUCT_SKU_MAX, `SKU must be at most ${PRODUCT_SKU_MAX} characters`)
  .regex(/^[A-Z0-9-]+$/, 'SKU may only contain letters, digits and dashes');

const objectId = (message: string) => z.string().regex(/^[a-f\d]{24}$/i, message);
const category = objectId('Choose a category');
const supplier = objectId('Choose a supplier');

/** Non-negative, at most 2 decimals. Money is kept as a plain number (no cents conversion). */
const price = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(String(value)), `${label} can have at most 2 decimals`);

const unitOfMeasure = z.enum(UNITS_OF_MEASURE, { error: `Unit must be one of ${UNITS_OF_MEASURE.join(', ')}` });

const imageUrl = z
  .string()
  .trim()
  .max(PRODUCT_IMAGE_URL_MAX, `Image URL must be at most ${PRODUCT_IMAGE_URL_MAX} characters`)
  .pipe(z.url({ protocol: /^https?$/, error: 'Image URL must be an http(s) link' }));

/**
 * Body of POST /api/products. Every product starts with no stock: stock only enters through a
 * recorded movement, so a non-zero `quantity` is rejected. Empty optional fields are left out.
 */
export const createProductSchema = z.object({
  title,
  sku,
  category,
  supplier: supplier.optional(),
  costPrice: price('Cost price'),
  salePrice: price('Sale price'),
  unitOfMeasure,
  imageUrl: imageUrl.optional(),
  quantity: z.literal(0, { error: 'Products start with 0 in stock; receive stock after creating it' }).optional(),
});

/** A price typed into an input: required, plain decimal digits (not `1e2` or `0x10`), then the same rules as the API. */
const formPrice = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} is required`, abort: true })
    .regex(/^-?(\d+\.?\d*|\.\d+)$/, `${label} must be a number`)
    .transform(Number)
    .pipe(price(label));

/** The create dialog. No quantity field; empty optional inputs are allowed and left out before sending. */
export const productFormSchema = z.object({
  title,
  sku,
  category: z.string().min(1, 'Choose a category').pipe(category),
  supplier: formField(supplier),
  costPrice: formPrice('Cost price'),
  salePrice: formPrice('Sale price'),
  unitOfMeasure,
  imageUrl: formField(imageUrl),
});

/** Query string of GET /api/products. Values arrive as strings. */
export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PRODUCTS_PAGE_SIZE_MAX).default(PRODUCTS_PAGE_SIZE_DEFAULT),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ProductListParams = z.input<typeof listProductsQuerySchema>;
