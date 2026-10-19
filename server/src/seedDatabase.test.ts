import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Category } from './models/Category.js';
import { Product } from './models/Product.js';
import { Settings } from './models/Settings.js';
import { StockMovement } from './models/StockMovement.js';
import { reconcile } from './services/stock.js';
import { MEMORY_DB_START_TIMEOUT_MS, connectMemoryDb, disconnectMemoryDb } from './test/memoryDb.js';
import { seedDatabase } from './seedDatabase.js';

// The seed against a throwaway database (#38): every quantity comes from its replayed ledger.

const NOW = new Date('2026-10-18T15:30:00Z');
const SEED_TIMEOUT_MS = 120_000;

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);

describe('seedDatabase', () => {
  beforeAll(() => seedDatabase(NOW), SEED_TIMEOUT_MS);

  it('writes the default settings with the seeded admin as the last editor', async () => {
    const settings = await Settings.find().populate<{ updatedBy: { email: string } }>('updatedBy', 'email').lean();
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({ lowStockThreshold: 10, currency: 'USD', updatedBy: { email: 'admin@inventory.local' } });
  });

  it('leaves every quantity equal to its ledger sum', async () => {
    const report = await reconcile();
    expect(report.mismatches).toEqual([]);
    expect(report.checked).toBeGreaterThanOrEqual(55);
    expect(report.checked).toBeLessThanOrEqual(65);
  });

  it('spreads products over 6 of the 8 categories, leaving 2 empty', async () => {
    const used = await Product.distinct('category');
    expect(await Category.countDocuments()).toBe(8);
    expect(used).toHaveLength(6);
  });

  it('gives each category its own SKU prefix', async () => {
    const products = await Product.find().select('sku category').lean();
    const prefixes = new Map<string, Set<string>>();
    for (const { sku, category } of products) {
      expect(sku).toMatch(/^[A-Z]{3}-\d{3}$/);
      prefixes.set(String(category), (prefixes.get(String(category)) ?? new Set()).add(sku.slice(0, 3)));
    }
    expect([...prefixes.values()].map((set) => set.size)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('gives every stock-status bucket, the low-stock boundary, Unassigned and Archived some products', async () => {
    const active = { archivedAt: null };
    expect(await Product.countDocuments({ ...active, quantity: 0 })).toBeGreaterThan(0);
    expect(await Product.countDocuments({ ...active, quantity: { $gte: 1, $lte: 10 } })).toBeGreaterThanOrEqual(5);
    expect(await Product.countDocuments({ ...active, quantity: 10 })).toBeGreaterThanOrEqual(2);
    expect(await Product.countDocuments({ ...active, quantity: { $gt: 10 } })).toBeGreaterThan(0);
    expect(await Product.countDocuments({ supplier: null })).toBeGreaterThanOrEqual(6);
    expect(await Product.countDocuments({ archivedAt: { $ne: null } })).toBeGreaterThanOrEqual(1);
  });

  it('includes mixed units, products without an image, and zero-stock products that never had a movement', async () => {
    expect((await Product.distinct('unitOfMeasure')).sort()).toEqual(['box', 'kg', 'l', 'm', 'pcs']);
    expect(await Product.countDocuments({ imageUrl: null })).toBeGreaterThan(0);
    const stocked = await StockMovement.distinct('product');
    expect(await Product.countDocuments({ quantity: 0, _id: { $nin: stocked } })).toBeGreaterThanOrEqual(2);
  });

  it('opens each ledger with a receive by the admin about 90 days back, and ends before today', async () => {
    const [oldest] = await StockMovement.find().sort({ occurredAt: 1 }).limit(1).populate<{ user: { email: string } }>('user', 'email').lean();
    const [newest] = await StockMovement.find().sort({ occurredAt: -1 }).limit(1).lean();
    const daysBack = (date: Date) => (NOW.getTime() - date.getTime()) / 86_400_000;
    expect(oldest).toMatchObject({ type: 'receive', note: 'Opening balance', user: { email: 'admin@inventory.local' } });
    expect(daysBack(oldest.occurredAt)).toBeGreaterThan(85);
    expect(daysBack(oldest.occurredAt)).toBeLessThan(95);
    expect(newest.occurredAt.getTime()).toBeLessThan(Date.UTC(2026, 9, 18));
  });

  it('includes receives, ships, and an adjustment with a detailed reason', async () => {
    expect((await StockMovement.distinct('type')).sort()).toEqual(['adjustment', 'receive', 'ship']);
    const adjustments = await StockMovement.find({ type: 'adjustment' }).lean();
    expect(adjustments.some(({ note }) => (note ?? '').length >= 60)).toBe(true);
  });

  it('archives products after their last movement', async () => {
    for (const product of await Product.find({ archivedAt: { $ne: null } }).lean()) {
      const [last] = await StockMovement.find({ product: product._id }).sort({ occurredAt: -1 }).limit(1).lean();
      if (last) expect(product.archivedAt!.getTime()).toBeGreaterThan(last.occurredAt.getTime());
    }
  });
});

describe('seedDatabase run twice on the same day', () => {
  const snapshot = async () => {
    const products = await Product.find()
      .sort({ sku: 1 })
      .select('-_id title sku category supplier costPrice salePrice quantity unitOfMeasure imageUrl archivedAt createdAt')
      .lean();
    const movements = await StockMovement.find()
      .populate<{ product: { sku: string } }>('product', 'sku')
      .select('-_id product type delta quantityAfter unitCost unitPrice note occurredAt')
      .lean();
    const rows = movements.map((movement) => ({ ...movement, product: movement.product.sku }));
    rows.sort((a, b) => a.product.localeCompare(b.product) || a.occurredAt.getTime() - b.occurredAt.getTime());
    return { products, movements: rows };
  };

  it('produces identical products and movements, apart from ids and users', async () => {
    await seedDatabase(NOW);
    const first = await snapshot();
    await seedDatabase(new Date(NOW.getTime() + 3_600_000));
    const second = await snapshot();

    expect(first.movements.length).toBeGreaterThan(500);
    expect(second).toEqual(first);
  }, SEED_TIMEOUT_MS);
});
