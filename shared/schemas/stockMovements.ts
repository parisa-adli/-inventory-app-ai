import { z } from 'zod';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '../constants/stock-movement-types';
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
 * The Adjust Stock dialog: the amount is typed as text (plain digits with an optional sign, not `1e2`),
 * then the same rules and messages as the API. The dialog adds the product it was opened for, which makes
 * the output a valid POST /api/stock-movements body (no hidden field the user could not fix).
 */
export const stockMovementFormSchema = z
  .object({
    type,
    quantity: z
      .string()
      .trim()
      .min(1, { error: 'Quantity is required', abort: true })
      .regex(/^[-+]?(\d+\.?\d*|\.\d+)$/, { error: 'Quantity must be a number', abort: true })
      .transform(Number),
    note,
  })
  .superRefine(checkRules);

export type StockMovementFormInput = z.input<typeof stockMovementFormSchema>;
export type StockMovementFormValues = z.output<typeof stockMovementFormSchema>;
