import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Settings } from '../models/Settings.js';
import { StockMovement } from '../models/StockMovement.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// The dashboard (C26): the In-vs-Out chart (#55), receive vs ship per hour, day, week or month cut in the viewer's
// timezone, the range's money cards, and the "Right now" cards and reorder alerts (#56).

const app = createApp();

let cookie: string[];
let userId: Types.ObjectId;
const productId = new Types.ObjectId();

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
  userId = user._id;
  cookie = [`${ACCESS_COOKIE}=${signAccessToken(String(userId))}`];
});

const chart = (query: Record<string, string>) =>
  request(app).get('/api/dashboard/movements-chart').query(query).set('Cookie', cookie);

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** A ledger entry written straight to the collection; the chart reads only type, delta and occurredAt. */
const movement = (type: 'receive' | 'ship' | 'adjustment', delta: number, occurredAt: Date) =>
  StockMovement.create({
    product: productId,
    type,
    delta,
    quantityAfter: 100,
    unitCost: 1,
    unitPrice: 2,
    note: type === 'adjustment' ? 'Count' : null,
    user: userId,
    occurredAt,
  });

describe('GET /api/dashboard/movements-chart', () => {
  it('7d answers 7 zero-filled day buckets, oldest first, today last', async () => {
    const res = await chart({ range: '7d', tz: 'UTC' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.range).toBe('7d');
    expect(res.body.granularity).toBe('day');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(res.body.buckets).toEqual(
      [6, 5, 4, 3, 2, 1, 0].map((daysAgo) => ({
        bucketStart: new Date(today.getTime() - daysAgo * DAY_MS).toISOString(),
        receivedUnits: 0,
        shippedUnits: 0,
        receivedValue: 0,
        shippedValue: 0,
      }))
    );
  });

  it('30d answers 30 day buckets ending today', async () => {
    const res = await chart({ range: '30d', tz: 'Europe/Berlin' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.buckets).toHaveLength(30);
    const last = new Date(res.body.buckets.at(-1).bucketStart).getTime();
    expect(Date.now() - last).toBeGreaterThanOrEqual(0);
    expect(Date.now() - last).toBeLessThan(25 * HOUR_MS);
  });

  it.each([
    ['an unknown range', { range: '14d', tz: 'UTC' }, 'range'],
    ['no range', { tz: 'UTC' }, 'range'],
    ['an invalid tz', { range: '7d', tz: 'Mars/Olympus_Mons' }, 'tz'],
    ['no tz', { range: '7d' }, 'tz'],
    ['a custom range with no days', { range: 'custom', tz: 'UTC' }, 'from'],
    ['a custom range ending before it starts', { range: 'custom', tz: 'UTC', from: '2026-10-10', to: '2026-10-09' }, 'to'],
    ['a day that does not exist', { range: 'custom', tz: 'UTC', from: '2026-02-30', to: '2026-03-01' }, 'from'],
  ])('refuses %s with 400 VALIDATION_ERROR', async (_label, query, field) => {
    const res = await chart(query);

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error)).toContain(field);
  });

  it('accepts a zone name in any case', async () => {
    const res = await chart({ range: '7d', tz: 'utc' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.buckets).toHaveLength(7);
  });

  it('sums receives and ships per bucket apart, shipped as a positive count, and leaves adjustments out', async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - DAY_MS);
    await movement('receive', 5, new Date(yesterday.getTime() + HOUR_MS));
    await movement('receive', 7, new Date(yesterday.getTime() + 20 * HOUR_MS));
    await movement('ship', -3, new Date(yesterday.getTime() + 2 * HOUR_MS));
    await movement('adjustment', 40, new Date(yesterday.getTime() + 3 * HOUR_MS));
    await movement('adjustment', -9, new Date(yesterday.getTime() + 4 * HOUR_MS));
    await movement('ship', -2, new Date());
    // Before the window: day 8 back
    await movement('receive', 99, new Date(today.getTime() - 7 * DAY_MS + HOUR_MS));

    const res = await chart({ range: '7d', tz: 'UTC' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    type Bucket = { receivedUnits: number; shippedUnits: number; receivedValue: number; shippedValue: number };
    expect(res.body.buckets.map(({ receivedUnits, shippedUnits }: Bucket) => [receivedUnits, shippedUnits])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [12, 3],
      [0, 2],
    ]);
    // Received at unit cost 1, shipped at unit price 2
    expect(res.body.buckets.at(-2)).toMatchObject({ receivedValue: 12, shippedValue: 6 });
  });

  // The exact count with a pinned clock is in services/dashboard.test.ts; here the request may cross an hour
  it('today is hour buckets from local midnight to the current hour', async () => {
    const before = new Date();
    const res = await chart({ range: 'today', tz: 'UTC' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.granularity).toBe('hour');
    const lastHour = new Date(res.body.buckets.at(-1).bucketStart).getTime();
    expect(lastHour).toBeGreaterThanOrEqual(before.getTime() - HOUR_MS);
    expect(lastHour).toBeLessThanOrEqual(Date.now());
    expect(new Date(res.body.buckets[0].bucketStart).getUTCHours()).toBe(0);
  });

  it('a custom range covers its days inclusive, and a long one is bucketed by week, then by month', async () => {
    await movement('receive', 4, new Date('2026-03-01T00:00:00Z'));
    await movement('receive', 6, new Date('2026-03-10T23:59:59Z'));
    await movement('receive', 99, new Date('2026-03-11T00:00:00Z'));

    const days = await chart({ range: 'custom', tz: 'UTC', from: '2026-03-01', to: '2026-03-10' });
    expect(days.status, JSON.stringify(days.body)).toBe(200);
    expect(days.body.granularity).toBe('day');
    expect(days.body.buckets).toHaveLength(10);
    expect(days.body.buckets.reduce((sum: number, bucket: { receivedUnits: number }) => sum + bucket.receivedUnits, 0)).toBe(10);

    const weeks = await chart({ range: 'custom', tz: 'UTC', from: '2026-01-01', to: '2026-03-31' });
    expect(weeks.body.granularity).toBe('week');
    expect(weeks.body.buckets[0].bucketStart).toBe('2025-12-29T00:00:00.000Z'); // the Monday of Jan 1's week

    const months = await chart({ range: 'custom', tz: 'UTC', from: '2025-01-15', to: '2026-03-31' });
    expect(months.body.granularity).toBe('month');
    expect(months.body.buckets).toHaveLength(15);
    expect(months.body.buckets.at(-1)).toMatchObject({ bucketStart: '2026-03-01T00:00:00.000Z', receivedUnits: 109 });
  });

  it('all time starts on the day of the first movement', async () => {
    await movement('receive', 1, new Date(Date.now() - 20 * DAY_MS));

    const res = await chart({ range: 'all', tz: 'UTC' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.granularity).toBe('day');
    expect(res.body.buckets).toHaveLength(21);
    expect(res.body.buckets[0].receivedUnits).toBe(1);
  });
});

describe('GET /api/dashboard/period-summary', () => {
  const summary = (query: Record<string, string>) =>
    request(app).get('/api/dashboard/period-summary').query(query).set('Cookie', cookie);

  it('sums inbound value, income and COGS at the recorded prices, leaving adjustments and older movements out', async () => {
    const at = new Date(Date.now() - HOUR_MS);
    await StockMovement.create([
      { product: productId, type: 'receive', delta: 10, quantityAfter: 10, unitCost: 0.1, unitPrice: 9, user: userId, occurredAt: at },
      { product: productId, type: 'ship', delta: -3, quantityAfter: 7, unitCost: 0.1, unitPrice: 19.99, user: userId, occurredAt: at },
      { product: productId, type: 'ship', delta: -2, quantityAfter: 5, unitCost: 4, unitPrice: 5, user: userId, occurredAt: at },
      { product: productId, type: 'adjustment', delta: -1, quantityAfter: 4, unitCost: 4, unitPrice: 5, note: 'Broken', user: userId, occurredAt: at },
      { product: productId, type: 'receive', delta: 50, quantityAfter: 54, unitCost: 4, unitPrice: 5, user: userId, occurredAt: new Date(Date.now() - 40 * DAY_MS) },
    ]);

    const res = await summary({ range: '30d', tz: 'UTC' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      inboundValue: 1, // 10 × 0.10
      income: 69.97, // 3 × 19.99 + 2 × 5
      cogs: 8.3, // 3 × 0.10 + 2 × 4
      grossProfit: 61.67,
    });
    expect((await summary({ range: 'all', tz: 'UTC' })).body.inboundValue).toBe(201);
  });

  it('answers zeros with no movements', async () => {
    const res = await summary({ range: 'all', tz: 'UTC' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ inboundValue: 0, income: 0, cogs: 0, grossProfit: 0 });
  });

  it('validates the range like the chart', async () => {
    const res = await summary({ range: 'custom', tz: 'UTC', from: '2026-10-01' });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
  });
});

let skuCounter = 0;
/** Test setup only: the app changes quantity through the stock module alone. */
const product = async (fields: { title?: string; quantity?: number; costPrice?: number; salePrice?: number; archived?: boolean }) => {
  const { archived, ...rest } = fields;
  const category = await Category.findOneAndUpdate({ title: 'Fixtures' }, {}, { upsert: true, new: true });
  return Product.create({
    title: 'Product',
    sku: `SKU-${++skuCounter}`,
    category: category._id,
    costPrice: 1,
    salePrice: 2,
    unitOfMeasure: 'pcs',
    ...rest,
    archivedAt: archived ? new Date() : null,
  });
};

const get = (path: string) => request(app).get(path).set('Cookie', cookie);

describe('GET /api/dashboard/summary', () => {
  it('totals active products, rounding money to cents with no floating-point drift', async () => {
    // 0.1 × 3 and 19.99 × 3 drift in binary floating point; the totals must not
    await product({ quantity: 3, costPrice: 0.1, salePrice: 19.99 });
    await product({ quantity: 7, costPrice: 12.5, salePrice: 0.7 });
    await product({ quantity: 0, costPrice: 99, salePrice: 99 });

    const res = await get('/api/dashboard/summary');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      totalProducts: 3,
      totalStockValue: 87.8, // 0.30 + 87.50
      lowStockCount: 2,
      outOfStockCount: 1,
    });
  });

  it('answers zeros with no products', async () => {
    const res = await get('/api/dashboard/summary');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ totalProducts: 0, totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0 });
  });

  it('leaves archived products out of every field', async () => {
    await product({ quantity: 20, costPrice: 1, salePrice: 2 });
    await product({ quantity: 0, archived: true });
    await product({ quantity: 3, costPrice: 50, salePrice: 60, archived: true });

    const res = await get('/api/dashboard/summary');

    expect(res.body).toEqual({ totalProducts: 1, totalStockValue: 20, lowStockCount: 0, outOfStockCount: 0 });
  });

  it('counts low and out like the products stock-status filter, under the stored threshold', async () => {
    await Settings.create({ lowStockThreshold: 4 });
    for (const quantity of [0, 0, 1, 4, 5, 30]) await product({ quantity });
    await product({ quantity: 2, archived: true });

    const res = await get('/api/dashboard/summary');
    const filtered = async (stockStatus: string) =>
      (await get('/api/products').query({ stockStatus })).body.total as number;

    expect(res.body.lowStockCount).toBe(2);
    expect(res.body.outOfStockCount).toBe(2);
    expect(res.body.lowStockCount).toBe(await filtered('low'));
    expect(res.body.outOfStockCount).toBe(await filtered('out'));
  });
});

describe('GET /api/dashboard/alerts', () => {
  it('lists out of stock first, then low by quantity ascending, then title, with the row fields', async () => {
    await product({ title: 'banana', quantity: 1 });
    await product({ title: 'Apple', quantity: 1 });
    await product({ title: 'Plenty', quantity: 11 });
    await product({ title: 'Zero B', quantity: 0 });
    await product({ title: 'zero a', quantity: 0 });
    await product({ title: 'Archived', quantity: 0, archived: true });
    const edge = await product({ title: 'Edge', quantity: 10 });

    const res = await get('/api/dashboard/alerts');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual(['zero a', 'Zero B', 'Apple', 'banana', 'Edge']);
    expect(res.body.items.at(-1)).toEqual({
      id: String(edge._id),
      title: 'Edge',
      sku: edge.sku,
      quantity: 10,
      unit: 'pcs',
      status: 'low',
    });
    expect(res.body.items[0].status).toBe('out');
  });

  it('caps items at 5 and counts every qualifying product in total', async () => {
    for (let i = 0; i < 25; i++) await product({ title: `Item ${String(i).padStart(2, '0')}`, quantity: i % 5 });

    const res = await get('/api/dashboard/alerts');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(25);
    // 5 per quantity 0–4, so the cut falls after all of quantity 0
    expect(res.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Item 00',
      'Item 05',
      'Item 10',
      'Item 15',
      'Item 20',
    ]);
  });

  it('follows the stored threshold', async () => {
    await Settings.create({ lowStockThreshold: 2 });
    await product({ title: 'Two', quantity: 2 });
    await product({ title: 'Three', quantity: 3 });

    const res = await get('/api/dashboard/alerts');

    expect(res.body).toMatchObject({ total: 1, items: [{ title: 'Two', status: 'low' }] });
  });
});
