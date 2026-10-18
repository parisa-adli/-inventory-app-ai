import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { recordMovement } from '../services/stock.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// POST /api/stock-movements over HTTP (#30): the inline +/- and, later, the Adjust Stock dialog.

const app = createApp();

let cookie: string[];
let userId: string;
let productId: string;

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
beforeEach(async () => {
  await clearMemoryDb();
  const user = await User.create({
    name: 'John Staff',
    email: 'john@inventory.local',
    role: 'staff',
    status: 'active',
    emailVerified: true,
    passwordHash: 'unused',
  });
  userId = String(user._id);
  cookie = [`${ACCESS_COOKIE}=${signAccessToken(userId)}`];
  const category = await Category.create({ title: 'Electronics' });
  const product = await Product.create({
    title: 'Wireless Mouse',
    sku: 'ELE-001',
    category: category._id,
    costPrice: 12.5,
    salePrice: 24.99,
    unitOfMeasure: 'pcs',
  });
  productId = String(product._id);
});

const post = (body: object) => request(app).post('/api/stock-movements').set('Cookie', cookie).send(body);
const quantity = async () => (await Product.findById(productId).lean())?.quantity;

describe('POST /api/stock-movements', () => {
  it('receives 1 (the inline +) and answers with the movement, made by the signed-in user', async () => {
    const res = await post({ productId, type: 'receive', quantity: 1 });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      type: 'receive',
      delta: 1,
      quantityAfter: 1,
      unitCost: 12.5,
      unitPrice: 24.99,
      note: null,
      occurredAt: expect.any(String),
      product: { id: productId, title: 'Wireless Mouse', sku: 'ELE-001', archived: false },
      user: { id: userId, name: 'John Staff' },
    });
    expect(await quantity()).toBe(1);
  });

  it('ships 1 (the inline −) and records a negative delta', async () => {
    await post({ productId, type: 'receive', quantity: 1 });

    const res = await post({ productId, type: 'ship', quantity: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'ship', delta: -1, quantityAfter: 0 });
    expect(await quantity()).toBe(0);
    expect(await StockMovement.countDocuments({ product: productId })).toBe(2);
  });

  it('refuses a ship of more than is on hand with 409 INSUFFICIENT_STOCK', async () => {
    const res = await post({ productId, type: 'ship', quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'INSUFFICIENT_STOCK', message: 'Only 0 on hand.', details: { onHand: 0 } });
  });

  it('refuses an archived product with 409 PRODUCT_ARCHIVED', async () => {
    await Product.updateOne({ _id: productId }, { archivedAt: new Date() });
    const res = await post({ productId, type: 'receive', quantity: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_ARCHIVED');
  });

  it('answers 404 NOT_FOUND for an unknown product', async () => {
    const res = await post({ productId: '000000000000000000000000', type: 'receive', quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('never accepts occurredAt from a request', async () => {
    const res = await post({ productId, type: 'receive', quantity: 1, occurredAt: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(201);
    expect(Math.abs(new Date(res.body.occurredAt).getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('keeps a trimmed note and treats a blank one as none', async () => {
    expect((await post({ productId, type: 'receive', quantity: 2, note: '  PO-17  ' })).body.note).toBe('PO-17');
    expect((await post({ productId, type: 'receive', quantity: 2, note: '   ' })).body.note).toBeNull();
  });

  it.each([
    ['no product', { productId: undefined }, 'productId:'],
    ['a malformed product id', { productId: 'nope' }, 'productId: Choose a product'],
    ['an unknown type', { type: 'gift' }, 'type: Type must be receive, ship or adjustment'],
    ['a quantity sent as text', { quantity: '1' }, 'quantity: Quantity must be a number'],
    ['a receive of 0', { quantity: 0 }, 'quantity: Quantity must be at least 1'],
    ['a negative receive', { quantity: -1 }, 'quantity: Quantity must be at least 1'],
    ['a fractional receive', { quantity: 0.5 }, 'quantity: Quantity must be a whole number'],
    ['a zero adjustment', { type: 'adjustment', quantity: 0, note: 'Recount' }, 'quantity: An adjustment cannot be 0'],
    ['an adjustment without a reason', { type: 'adjustment', quantity: 2 }, 'note: An adjustment needs a reason'],
    ['a note over 500 characters', { note: 'x'.repeat(501) }, 'note: Note must be at most 500 characters'],
  ])('rejects %s with 400 and changes nothing', async (_case, override, message) => {
    const res = await post({ productId, type: 'receive', quantity: 1, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain(message);
    expect(await quantity()).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);
  });

  it('accepts a signed adjustment with a reason', async () => {
    await post({ productId, type: 'receive', quantity: 5 });
    const res = await post({ productId, type: 'adjustment', quantity: -2, note: 'Two found damaged' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'adjustment', delta: -2, quantityAfter: 3, note: 'Two found damaged' });
  });
});

describe('GET /api/stock-movements', () => {
  const list = (query = '') => request(app).get(`/api/stock-movements${query}`).set('Cookie', cookie);

  it("lists a product's movements newest first, in the contract shape", async () => {
    await post({ productId, type: 'receive', quantity: 5, note: 'PO-1' });
    await post({ productId, type: 'ship', quantity: 3 });

    const res = await list(`?product=${productId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(res.body.items).toEqual([
      {
        id: expect.any(String),
        type: 'ship',
        delta: -3,
        quantityAfter: 2,
        unitCost: 12.5,
        unitPrice: 24.99,
        note: null,
        occurredAt: expect.any(String),
        product: { id: productId, title: 'Wireless Mouse', sku: 'ELE-001', archived: false },
        user: { id: userId, name: 'John Staff' },
      },
      expect.objectContaining({ type: 'receive', delta: 5, quantityAfter: 5, note: 'PO-1' }),
    ]);
  });

  it("scopes to one product, and keeps an archived product's movements, flagged", async () => {
    const other = await Product.create({
      title: 'USB Hub',
      sku: 'ELE-002',
      category: (await Category.findOne())!._id,
      costPrice: 8,
      salePrice: 15,
      unitOfMeasure: 'pcs',
    });
    await post({ productId, type: 'receive', quantity: 1 });
    await post({ productId: String(other._id), type: 'receive', quantity: 2 });
    await Product.updateOne({ _id: productId }, { archivedAt: new Date() });

    const mine = await list(`?product=${productId}`);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].product).toMatchObject({ id: productId, archived: true });

    const all = await list();
    expect(all.body.items.map((m: { product: { sku: string } }) => m.product.sku)).toEqual(['ELE-002', 'ELE-001']);
  });

  it('filters by type', async () => {
    await post({ productId, type: 'receive', quantity: 5 });
    await post({ productId, type: 'adjustment', quantity: -1, note: 'Damaged' });
    await post({ productId, type: 'ship', quantity: 1 });

    const res = await list('?type=adjustment');
    expect(res.body.items).toEqual([expect.objectContaining({ type: 'adjustment', note: 'Damaged' })]);
  });

  it('filters by a date range that includes both end instants (the client sends the end of the last day)', async () => {
    const at = (occurredAt: string, note: string) =>
      recordMovement({ productId, type: 'receive', quantity: 1, note, userId, occurredAt: new Date(occurredAt) });
    await at('2026-10-14T23:59:59.999Z', 'before');
    await at('2026-10-15T00:00:00.000Z', 'first instant');
    await at('2026-10-16T23:59:59.999Z', 'last instant');
    await at('2026-10-17T00:00:00.000Z', 'after');

    const res = await list('?dateFrom=2026-10-15T00:00:00.000Z&dateTo=2026-10-16T23:59:59.999Z');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((m: { note: string }) => m.note)).toEqual(['last instant', 'first instant']);

    // An instant with an offset is the same instant: 03:30 at +03:30 is midnight UTC
    const fromOnly = await list(`?dateFrom=${encodeURIComponent('2026-10-17T03:30:00+03:30')}`);
    expect(fromOnly.body.items.map((m: { note: string }) => m.note)).toEqual(['after']);
  });

  it('pages newest first, 20 by default', async () => {
    for (let i = 1; i <= 3; i++) await post({ productId, type: 'receive', quantity: i });

    const res = await list('?limit=2&page=2');
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.items.map((m: { delta: number }) => m.delta)).toEqual([1]);
  });

  it.each([
    ['a malformed product id', '?product=nope', 'product: Choose a product'],
    ['an unknown type', '?type=gift', 'type: Type must be receive, ship or adjustment'],
    ['a date without a time', '?dateFrom=2026-10-15', 'dateFrom: dateFrom must be an ISO date-time'],
    ['a limit over 100', '?limit=101', 'limit:'],
    [
      'a range that ends before it starts',
      '?dateFrom=2026-10-16T00:00:00.000Z&dateTo=2026-10-15T23:59:59.999Z',
      'dateTo: dateTo cannot be before dateFrom',
    ],
  ])('rejects %s with 400', async (_case, query, message) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain(message);
  });
});
