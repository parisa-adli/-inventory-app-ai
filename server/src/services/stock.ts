import { Types, isValidObjectId } from 'mongoose';
import {
  signedDelta,
  stockMovementRuleError,
  type ReconcileMismatch,
  type ReconcileQuery,
  type ReconcileReport,
  type StockMovementType,
} from '@inventory/shared';
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
  return signedDelta(type, quantity);
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

/** Each product's ledger sum, or just one product's; a product with no movements is absent (it sums to 0). */
const ledgerSums = async (productId?: string) => {
  const rows = await StockMovement.aggregate<{ _id: unknown; sum: number }>([
    ...(productId ? [{ $match: { product: new Types.ObjectId(productId) } }] : []),
    { $group: { _id: '$product', sum: { $sum: '$delta' } } },
  ]);
  return new Map(rows.map(({ _id, sum }) => [String(_id), sum]));
};

/** How long a movement between its increment and its insert is given to land before a mismatch is re-checked. */
const SETTLE_MS = 500;

/**
 * Reads one product again, after the settle pause. A movement between its increment and its insert puts the
 * quantity briefly ahead of the ledger, so a first-pass mismatch is only reported (or repaired) if it is still there.
 */
const recheck = async (productId: string) => {
  const product = await Product.findById(productId).select('sku quantity').lean();
  if (!product) return null; // deleted since the first pass
  const ledgerSum = (await ledgerSums(productId)).get(productId) ?? 0;
  return product.quantity === ledgerSum ? null : { productId, sku: product.sku, quantity: product.quantity, ledgerSum };
};

/**
 * Sets the quantity to the ledger sum, only if it still holds the value the re-check saw: a stock change since
 * then means the comparison is stale. Writes no movement (a repair is not stock moving).
 */
const repairQuantity = async ({ productId, quantity, ledgerSum }: ReconcileMismatch) => {
  const { modifiedCount } = await Product.updateOne({ _id: productId, quantity }, { $set: { quantity: ledgerSum } });
  if (modifiedCount === 0) return false;
  console.warn(`[stock] Reconciliation set product ${productId} from ${quantity} to its ledger sum ${ledgerSum}.`);
  return true;
};

/**
 * Compares every product's quantity with its ledger sum (docs/adr/0002, step 4) and, with `fix`, repairs the
 * products that still disagree on a re-check.
 */
export const reconcile = async ({ fix }: Partial<ReconcileQuery> = {}): Promise<ReconcileReport> => {
  const products = await Product.find().select('quantity').lean();
  const sums = await ledgerSums();
  const suspects = products
    .filter(({ _id, quantity }) => quantity !== (sums.get(String(_id)) ?? 0))
    .map(({ _id }) => String(_id));

  const mismatches: ReconcileMismatch[] = [];
  if (suspects.length > 0) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  for (const productId of suspects) {
    const mismatch = await recheck(productId);
    if (!mismatch) continue;
    mismatches.push(fix ? { ...mismatch, fixed: await repairQuantity(mismatch) } : mismatch);
  }
  return { checked: products.length, mismatches };
};
