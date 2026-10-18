import { isValidObjectId } from 'mongoose';
import { STOCK_MOVEMENT_TYPES, stockMovementRuleError, type StockMovementType } from '@inventory/shared';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

/**
 * The stock module: the only writer of `Product.quantity` (#27, docs/adr/0002). Every change goes through
 * one conditional increment plus a ledger insert, compensated if the insert fails.
 */

export interface RecordMovementInput {
  productId: string;
  type: StockMovementType;
  /** Receive / ship: a positive amount. Adjustment: signed and non-zero. */
  quantity: number;
  note?: string;
  userId: string;
  /** Seed only; never accepted over HTTP. */
  occurredAt?: Date;
}

/** The same rules as the request schema, for callers that skip HTTP (the seed). */
const validatedDelta = (type: StockMovementType, quantity: number, note: string | undefined) => {
  const broken = stockMovementRuleError(type, quantity, note);
  if (broken) throw new ValidationError(`${broken.path}: ${broken.message}`);
  return type === STOCK_MOVEMENT_TYPES.SHIP ? -quantity : quantity;
};

/**
 * Why the guard matched nothing, read after the fact: missing, then archived (so archived beats short),
 * then short. `onHand` is a best-effort snapshot; integrity comes from the guard, not from this read.
 */
const classifyMiss = async (productId: string) => {
  const product = await Product.findById(productId).select('quantity archivedAt').lean();
  if (!product) return new NotFoundError('Product not found');
  if (product.archivedAt) return new AppError(409, 'PRODUCT_ARCHIVED', 'This product is archived; its stock cannot change.');
  return new AppError(409, 'INSUFFICIENT_STOCK', `Only ${product.quantity} on hand.`, { onHand: product.quantity });
};

export const recordMovement = async ({ productId, type, quantity, note, userId, occurredAt }: RecordMovementInput) => {
  const delta = validatedDelta(type, quantity, note);
  // HTTP callers are schema-checked; a direct caller's malformed id is simply a product that doesn't exist
  if (!isValidObjectId(productId)) throw new NotFoundError('Product not found');
  const product = await Product.findOneAndUpdate(
    { _id: productId, archivedAt: null, ...(delta < 0 && { quantity: { $gte: -delta } }) },
    { $inc: { quantity: delta } },
    { returnDocument: 'after' }
  ).lean();
  if (!product) throw await classifyMiss(productId);

  try {
    return await StockMovement.create({
      product: productId,
      type,
      delta,
      quantityAfter: product.quantity,
      unitCost: product.costPrice,
      unitPrice: product.salePrice,
      note: note?.trim() || null,
      user: userId,
      occurredAt,
    });
  } catch (insertError) {
    await compensate(productId, delta);
    throw insertError;
  }
};

/** Reverses an applied delta whose movement was never written. If even that fails, reconciliation repairs the drift. */
const compensate = async (productId: string, delta: number) => {
  try {
    await Product.updateOne({ _id: productId }, { $inc: { quantity: -delta } });
  } catch (undoError) {
    console.error(
      `[stock] LEDGER DRIFT: product ${productId} kept a delta of ${delta} with no movement; run reconciliation to repair it.`,
      undoError
    );
  }
};
