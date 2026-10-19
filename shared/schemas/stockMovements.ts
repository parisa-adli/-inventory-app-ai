import { z } from 'zod';
import { ADJUSTMENT_DIRECTIONS, STOCK_MOVEMENT_TYPES, type StockMovementType } from '../constants/stock-movement-types';
import { paginationFields } from './pagination';
import { objectId } from './catalog';

export const STOCK_MOVEMENT_NOTE_MAX = 500;

/**
 * The rules every stock change obeys, shared by the request schema and the stock module (which checks them
 * again for callers that skip HTTP, like the seed). Receive and ship take a positive amount; an adjustment takes
 * a signed, non-zero amount and needs a reason. Returns the first broken rule, or null.
 */
export const stockMovementRuleError = (
  type: StockMovementType,
  quantity: number,
  note: string | undefined
): { path: 'quantity' | 'note'; message: string } | null => {
  if (!Number.isInteger(quantity)) return { path: 'quantity', message: 'Quantity must be a whole number' };
  if (type === STOCK_MOVEMENT_TYPES.ADJUSTMENT) {
    if (quantity === 0) return { path: 'quantity', message: 'An adjustment cannot be 0' };
    if (!note?.trim()) return { path: 'note', message: 'An adjustment needs a reason' };
    return null;
  }
  if (quantity < 1) return { path: 'quantity', message: 'Quantity must be at least 1' };
  return null;
};

const productId = objectId('Choose a product');
const type = z.enum(STOCK_MOVEMENT_TYPES, { error: 'Type must be receive, ship or adjustment' });

/** Trimmed; a blank note counts as no note. */
const note = z
  .string()
  .trim()
  .max(STOCK_MOVEMENT_NOTE_MAX, `Note must be at most ${STOCK_MOVEMENT_NOTE_MAX} characters`)
  .transform((value) => value || undefined);

const checkRules = (
  { type, quantity, note }: { type: StockMovementType; quantity: number; note?: string },
  ctx: z.RefinementCtx
) => {
  const broken = stockMovementRuleError(type, quantity, note);
  if (broken) ctx.addIssue({ code: 'custom', path: [broken.path], message: broken.message });
};

/**
 * Body of POST /api/stock-movements. `occurredAt` is never accepted here (unknown keys are stripped):
 * only the seed backdates a movement. A blank note counts as no note.
 */
export const createStockMovementSchema = z
  .object({
    productId,
    type,
    quantity: z.number({ error: 'Quantity must be a number' }),
    note: note.optional(),
  })
  .superRefine(checkRules);

export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;

/**
 * The Adjust Stock form takes a positive amount for every type. An adjustment adds a direction and still needs a
 * reason. The messages are the API's own.
 */
const checkFormRules = (
  { type, quantity, note }: { type: StockMovementType; quantity: number; note?: string },
  ctx: z.RefinementCtx
) => {
  const broken =
    stockMovementRuleError(STOCK_MOVEMENT_TYPES.RECEIVE, quantity, note) ??
    (type === STOCK_MOVEMENT_TYPES.ADJUSTMENT ? stockMovementRuleError(type, quantity, note) : null);
  if (broken) ctx.addIssue({ code: 'custom', path: [broken.path], message: broken.message });
};

/**
 * The Adjust Stock dialog: the amount is typed as text (plain digits, not `1e2`) and an adjustment is an Increase
 * or a Decrease of it. The output is signed the way the API wants it (a decrease of 4 is `quantity: -4`). The
 * dialog adds the product it was opened for, which makes the output a valid POST /api/stock-movements body.
 */
export const stockMovementFormSchema = z
  .object({
    type,
    direction: z.enum(ADJUSTMENT_DIRECTIONS).default(ADJUSTMENT_DIRECTIONS.INCREASE),
    quantity: z
      .string()
      .trim()
      .min(1, { error: 'Quantity is required', abort: true })
      .regex(/^[-+]?(\d+\.?\d*|\.\d+)$/, { error: 'Quantity must be a number', abort: true })
      .transform(Number),
    note,
  })
  .superRefine(checkFormRules)
  .transform(({ direction, quantity, ...movement }) => ({
    ...movement,
    quantity:
      movement.type === STOCK_MOVEMENT_TYPES.ADJUSTMENT && direction === ADJUSTMENT_DIRECTIONS.DECREASE ? -quantity : quantity,
  }));

export type StockMovementFormInput = z.input<typeof stockMovementFormSchema>;
export type StockMovementFormValues = z.output<typeof stockMovementFormSchema>;

export const STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT = 20;
export const STOCK_MOVEMENTS_PAGE_SIZE_MAX = 100;

/** An ISO instant (`Z` or an offset). The client computes it from the user's local day; the server assumes no timezone. */
const instant = (label: string) =>
  z.iso
    .datetime({ offset: true, error: `${label} must be an ISO date-time` })
    .transform((value) => new Date(value));

export const STOCK_MOVEMENTS_SEARCH_MAX = 100;

/**
 * The filters of GET /api/stock-movements and its summary. Values arrive as strings. `product` scopes to one product
 * (the Stock History dialog); `search` matches product titles and SKUs; `user` is who made the movement. Both ends of
 * the date range are inclusive: for a whole last day the client sends its final instant (23:59:59.999 local).
 */
const filterFields = {
  product: productId.optional(),
  search: z.string().trim().max(STOCK_MOVEMENTS_SEARCH_MAX).optional(),
  user: objectId('Choose a user').optional(),
  type: type.optional(),
  dateFrom: instant('dateFrom').optional(),
  dateTo: instant('dateTo').optional(),
};

const checkDateOrder = ({ dateFrom, dateTo }: { dateFrom?: Date; dateTo?: Date }, ctx: z.RefinementCtx) => {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    ctx.addIssue({ code: 'custom', path: ['dateTo'], message: 'dateTo cannot be before dateFrom' });
  }
};

/** Query string of GET /api/stock-movements/summary: the list's filters, no paging. */
export const stockMovementsFilterSchema = z.object(filterFields).superRefine(checkDateOrder);

export type StockMovementsFilter = z.infer<typeof stockMovementsFilterSchema>;
export type StockMovementsFilterParams = z.input<typeof stockMovementsFilterSchema>;

/** Query string of GET /api/stock-movements. */
export const listStockMovementsQuerySchema = z
  .object({ ...filterFields, ...paginationFields(STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT, STOCK_MOVEMENTS_PAGE_SIZE_MAX) })
  .superRefine(checkDateOrder);

export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;
export type StockMovementListParams = z.input<typeof listStockMovementsQuerySchema>;

/** Query string of GET /api/admin/reconcile. `fix=true` repairs what the check finds. */
export const reconcileQuerySchema = z.object({
  fix: z.stringbool().default(false),
});

export type ReconcileQuery = z.infer<typeof reconcileQuerySchema>;
