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

/**
 * Body of POST /api/stock-movements. `occurredAt` is never accepted here (unknown keys are stripped):
 * only the seed backdates a movement. A blank note counts as no note.
 */
export const createStockMovementSchema = z
  .object({
    productId: objectId('Choose a product'),
    type: z.enum(STOCK_MOVEMENT_TYPES, { error: 'Type must be receive, ship or adjustment' }),
    quantity: z.number({ error: 'Quantity must be a number' }),
    note: z
      .string()
      .trim()
      .max(STOCK_MOVEMENT_NOTE_MAX, `Note must be at most ${STOCK_MOVEMENT_NOTE_MAX} characters`)
      .transform((note) => note || undefined)
      .optional(),
  })
  .superRefine(({ type, quantity, note }, ctx) => {
    const broken = stockMovementRuleError(type, quantity, note);
    if (broken) ctx.addIssue({ code: 'custom', path: [broken.path], message: broken.message });
  });

export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
