import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { User } from '../models/User.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';
import { recordMovement } from './stock.js';

// The stock module called directly (#30): what HTTP can't reach, or what the #27 Q&A specified directly.

let userId: string;
let categoryId: string;

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await clearMemoryDb();
  const user = await User.create({
    name: 'Stock Keeper',
    email: 'keeper@inventory.local',
    role: 'staff',
    status: 'active',
    emailVerified: true,
    passwordHash: 'unused',
  });
  userId = String(user._id);
  categoryId = String((await Category.create({ title: 'Electronics' }))._id);
});

let skuCounter = 0;
const newProduct = async (extra: object = {}) => {
  const product = await Product.create({
    title: 'Wireless Mouse',
    sku: `ELE-${++skuCounter}`,
    category: categoryId,
    costPrice: 12.5,
    salePrice: 24.99,
    unitOfMeasure: 'pcs',
    ...extra,
  });
  return String(product._id);
};

const quantityOf = async (productId: string) => (await Product.findById(productId).lean())?.quantity;
const movementsOf = (productId: string) => StockMovement.find({ product: productId }).sort({ _id: 1 }).lean();

describe('recordMovement', () => {
  it('receives stock and writes one movement with the user, delta, quantity after and price snapshot', async () => {
    const productId = await newProduct();

    const movement = await recordMovement({ productId, type: 'receive', quantity: 5, note: 'PO-1', userId });

    expect(await quantityOf(productId)).toBe(5);
    const movements = await movementsOf(productId);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: 'receive',
      delta: 5,
      quantityAfter: 5,
      unitCost: 12.5,
      unitPrice: 24.99,
      note: 'PO-1',
    });
    expect(String(movements[0].user)).toBe(userId);
    expect(String(movement._id)).toBe(String(movements[0]._id));
  });

  it('lets exactly the stock on hand be shipped when many ships race, never going negative', async () => {
    const productId = await newProduct();
    await recordMovement({ productId, type: 'receive', quantity: 7, userId });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => recordMovement({ productId, type: 'ship', quantity: 2, userId }))
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(refused).toHaveLength(17);
    for (const { reason } of refused) expect(reason).toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_STOCK' });
    expect(await quantityOf(productId)).toBe(1);
    const movements = await movementsOf(productId);
    expect(movements.map((m) => m.delta)).toEqual([7, -2, -2, -2]);
    expect(movements.map((m) => m.quantityAfter).sort()).toEqual([1, 3, 5, 7]);
  });
});

describe('recordMovement refusals', () => {
  it('refuses a missing product with 404 NOT_FOUND', async () => {
    await expect(
      recordMovement({ productId: '000000000000000000000000', type: 'receive', quantity: 1, userId })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('treats a malformed product id from a direct caller as not found', async () => {
    await expect(recordMovement({ productId: 'nope', type: 'receive', quantity: 1, userId })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it.each(['receive', 'ship', 'adjustment'] as const)('freezes an archived product: %s is 409 PRODUCT_ARCHIVED', async (type) => {
    const productId = await newProduct();
    await recordMovement({ productId, type: 'receive', quantity: 3, userId });
    await Product.updateOne({ _id: productId }, { archivedAt: new Date() });

    await expect(recordMovement({ productId, type, quantity: 1, note: 'Recount', userId })).rejects.toMatchObject({
      statusCode: 409,
      code: 'PRODUCT_ARCHIVED',
    });
    expect(await quantityOf(productId)).toBe(3);
    expect(await movementsOf(productId)).toHaveLength(1);
  });

  it('refuses shipping or adjusting below zero with 409 INSUFFICIENT_STOCK and the amount on hand', async () => {
    const productId = await newProduct();
    await recordMovement({ productId, type: 'receive', quantity: 2, userId });

    for (const input of [
      { type: 'ship', quantity: 3 },
      { type: 'adjustment', quantity: -3, note: 'Damaged' },
    ] as const) {
      await expect(recordMovement({ productId, userId, ...input })).rejects.toMatchObject({
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
        message: 'Only 2 on hand.',
        details: { onHand: 2 },
      });
    }
    expect(await quantityOf(productId)).toBe(2);
    expect(await movementsOf(productId)).toHaveLength(1);
  });

  it('reports archived, not insufficient, when an archived product is also short', async () => {
    const productId = await newProduct({ archivedAt: new Date() });

    await expect(recordMovement({ productId, type: 'ship', quantity: 5, userId })).rejects.toMatchObject({
      code: 'PRODUCT_ARCHIVED',
    });
  });

  it.each([
    ['a receive of 0', { type: 'receive', quantity: 0 }, 'quantity: Quantity must be at least 1'],
    ['a negative ship', { type: 'ship', quantity: -1 }, 'quantity: Quantity must be at least 1'],
    ['a fractional receive', { type: 'receive', quantity: 1.5 }, 'quantity: Quantity must be a whole number'],
    ['a zero adjustment', { type: 'adjustment', quantity: 0, note: 'Recount' }, 'quantity: An adjustment cannot be 0'],
    ['an adjustment without a reason', { type: 'adjustment', quantity: 2, note: '  ' }, 'note: An adjustment needs a reason'],
  ] as const)('refuses %s with VALIDATION_ERROR and changes nothing', async (_case, input, message) => {
    const productId = await newProduct();

    await expect(recordMovement({ productId, userId, ...input })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message,
    });
    expect(await quantityOf(productId)).toBe(0);
    expect(await movementsOf(productId)).toHaveLength(0);
  });
});

describe('recordMovement snapshots', () => {
  it('keeps the prices of the moment, so a later price edit does not rewrite history', async () => {
    const productId = await newProduct();
    await recordMovement({ productId, type: 'receive', quantity: 4, userId });
    await Product.updateOne({ _id: productId }, { costPrice: 20, salePrice: 30 });
    await recordMovement({ productId, type: 'adjustment', quantity: -1, note: 'Dropped and broken', userId });

    const movements = await movementsOf(productId);
    expect(movements.map(({ delta, quantityAfter, unitCost, unitPrice, note }) => ({ delta, quantityAfter, unitCost, unitPrice, note }))).toEqual([
      { delta: 4, quantityAfter: 4, unitCost: 12.5, unitPrice: 24.99, note: null },
      { delta: -1, quantityAfter: 3, unitCost: 20, unitPrice: 30, note: 'Dropped and broken' },
    ]);
  });

  it('backdates a movement only when the caller (the seed) passes occurredAt', async () => {
    const productId = await newProduct();
    const occurredAt = new Date('2026-07-20T09:00:00.000Z');

    const backdated = await recordMovement({ productId, type: 'receive', quantity: 1, userId, occurredAt });
    const now = await recordMovement({ productId, type: 'receive', quantity: 1, userId });

    expect(backdated.occurredAt).toEqual(occurredAt);
    expect(Math.abs(now.occurredAt.getTime() - Date.now())).toBeLessThan(5_000);
  });
});

describe('recordMovement compensation', () => {
  it('undoes the quantity change when the movement cannot be written', async () => {
    const productId = await newProduct();
    await recordMovement({ productId, type: 'receive', quantity: 5, userId });
    const insertFailure = new Error('insert failed');
    vi.spyOn(StockMovement, 'create').mockRejectedValueOnce(insertFailure);

    await expect(recordMovement({ productId, type: 'ship', quantity: 2, userId })).rejects.toBe(insertFailure);

    expect(await quantityOf(productId)).toBe(5);
    expect(await movementsOf(productId)).toHaveLength(1);
  });

  it('rethrows the original error and logs loudly when the undo fails too', async () => {
    const productId = await newProduct();
    const insertFailure = new Error('insert failed');
    vi.spyOn(StockMovement, 'create').mockRejectedValueOnce(insertFailure);
    vi.spyOn(Product, 'updateOne').mockRejectedValueOnce(new Error('undo failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(recordMovement({ productId, type: 'receive', quantity: 3, userId })).rejects.toBe(insertFailure);

    // The drift is left for reconciliation to find
    expect(await quantityOf(productId)).toBe(3);
    expect(await movementsOf(productId)).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(productId), expect.anything());
  });
});

describe('StockMovement is append-only', () => {
  it('refuses every update and delete query', async () => {
    const productId = await newProduct();
    const movement = await recordMovement({ productId, type: 'receive', quantity: 5, userId });
    const byId = { _id: movement._id };

    await expect(StockMovement.updateOne(byId, { delta: 50 })).rejects.toThrow(/immutable/);
    await expect(StockMovement.updateMany({}, { delta: 50 })).rejects.toThrow(/immutable/);
    await expect(StockMovement.findOneAndUpdate(byId, { delta: 50 })).rejects.toThrow(/immutable/);
    await expect(StockMovement.findByIdAndUpdate(movement._id, { delta: 50 })).rejects.toThrow(/immutable/);
    await expect(StockMovement.replaceOne(byId, { delta: 50 })).rejects.toThrow(/immutable/);
    await expect(StockMovement.deleteOne(byId)).rejects.toThrow(/immutable/);
    await expect(StockMovement.deleteMany({})).rejects.toThrow(/immutable/);
    await expect(StockMovement.findOneAndDelete(byId)).rejects.toThrow(/immutable/);
    await expect(StockMovement.findByIdAndDelete(movement._id)).rejects.toThrow(/immutable/);

    await expect(StockMovement.bulkWrite([{ updateOne: { filter: byId, update: { delta: 50 } } }])).rejects.toThrow(/immutable/);
    await expect(StockMovement.bulkWrite([{ deleteMany: { filter: {} } }])).rejects.toThrow(/immutable/);

    movement.delta = 50;
    await expect(movement.save()).rejects.toThrow(/immutable/);
    await expect(movement.deleteOne()).rejects.toThrow(/immutable/);

    expect(await movementsOf(productId)).toMatchObject([{ delta: 5 }]);
  });
});
