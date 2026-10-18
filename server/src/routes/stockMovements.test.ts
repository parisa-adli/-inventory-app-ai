import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
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
