import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Settings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// App settings over HTTP (#54, C25): the singleton, its validation, and the products filter following the threshold.

const app = createApp();

let counter = 0;
const sessionAs = async (role: 'admin' | 'staff', name: string = role) => {
  const user = await User.create({
    name,
    email: `settings${++counter}@inventory.local`,
    role,
    status: 'active',
    emailVerified: true,
    passwordHash: 'unused',
  });
  return { id: String(user._id), cookie: [`${ACCESS_COOKIE}=${signAccessToken(String(user._id))}`] };
};

let admin: Awaited<ReturnType<typeof sessionAs>>;
let staff: Awaited<ReturnType<typeof sessionAs>>;

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
beforeEach(async () => {
  await clearMemoryDb();
  admin = await sessionAs('admin', 'Ada Admin');
  staff = await sessionAs('staff');
});

const read = (cookie = staff.cookie) => request(app).get('/api/settings').set('Cookie', cookie);
const patch = (body: object, cookie = admin.cookie) => request(app).patch('/api/settings').set('Cookie', cookie).send(body);

describe('GET /api/settings', () => {
  it('creates the defaults on first read, exactly once', async () => {
    const first = await read();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toEqual({
      lowStockThreshold: 10,
      currency: 'USD',
      updatedAt: expect.any(String),
      updatedBy: null,
    });

    const second = await read(admin.cookie);
    expect(second.body).toEqual(first.body);
    expect(await Settings.countDocuments()).toBe(1);
  });

  it('creates one document when first reads arrive together', async () => {
    const answers = await Promise.all([read(), read(), read(), read()]);
    expect(answers.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    expect(await Settings.countDocuments()).toBe(1);
  });
});

describe('PATCH /api/settings', () => {
  it('saves a change and records who made it and when', async () => {
    const before = await read();

    const res = await patch({ lowStockThreshold: 25, currency: 'EUR' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      lowStockThreshold: 25,
      currency: 'EUR',
      updatedAt: expect.any(String),
      updatedBy: { id: admin.id, name: 'Ada Admin' },
    });
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before.body.updatedAt).getTime());
    expect((await read()).body).toEqual(res.body);
  });

  it('keeps fields the body leaves out', async () => {
    await patch({ currency: 'GBP' });
    const res = await patch({ lowStockThreshold: 3 });
    expect(res.body).toMatchObject({ lowStockThreshold: 3, currency: 'GBP' });
  });

  it('works before the document exists', async () => {
    const res = await patch({ currency: 'JPY' });
    expect(res.body).toMatchObject({ lowStockThreshold: 10, currency: 'JPY', updatedBy: { id: admin.id } });
    expect(await Settings.countDocuments()).toBe(1);
  });

  it.each([1, 10_000])('accepts a threshold of %i', async (lowStockThreshold) => {
    const res = await patch({ lowStockThreshold });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.lowStockThreshold).toBe(lowStockThreshold);
  });

  it.each([
    ['an empty body', {}],
    ['a threshold of 0', { lowStockThreshold: 0 }],
    ['a threshold of 10,001', { lowStockThreshold: 10_001 }],
    ['a fractional threshold', { lowStockThreshold: 2.5 }],
    ['a threshold as text', { lowStockThreshold: '5' }],
    ['a 2-letter currency', { currency: 'EU' }],
    ['a currency with digits', { currency: 'E1R' }],
    ['a lower-case currency', { currency: 'eur' }],
    ['an unknown key', { currency: 'EUR', theme: 'dark' }],
  ])('rejects %s with 400 and changes nothing', async (_case, body) => {
    const res = await patch(body);
    expect({ status: res.status, code: res.body.error?.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect((await read()).body).toMatchObject({ lowStockThreshold: 10, currency: 'USD', updatedBy: null });
  });

  it('answers the empty body with "Send at least one field to change"', async () => {
    const res = await patch({});
    expect(JSON.stringify(res.body)).toContain('Send at least one field to change');
  });

  it('refuses staff with 403', async () => {
    const res = await patch({ lowStockThreshold: 5 }, staff.cookie);
    expect({ status: res.status, code: res.body.error?.code }).toEqual({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('the products stock-status filter', () => {
  const titles = async (stockStatus: string) => {
    const res = await request(app).get(`/api/products?sort=title&stockStatus=${stockStatus}`).set('Cookie', staff.cookie);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.items.map((item: { title: string }) => item.title);
  };

  it('re-buckets the boundary products when the threshold changes', async () => {
    const category = await Category.create({ title: 'Tools' });
    for (const quantity of [0, 5, 6, 10, 11]) {
      await Product.create({
        title: `Qty ${String(quantity).padStart(2, '0')}`,
        sku: `QTY-${quantity}`,
        category: category._id,
        costPrice: 1,
        salePrice: 2,
        quantity,
        unitOfMeasure: 'pcs',
      });
    }

    expect(await titles('low')).toEqual(['Qty 05', 'Qty 06', 'Qty 10']);
    expect(await titles('in')).toEqual(['Qty 11']);

    await patch({ lowStockThreshold: 5 });
    expect(await titles('low')).toEqual(['Qty 05']);
    expect(await titles('in')).toEqual(['Qty 06', 'Qty 10', 'Qty 11']);
    expect(await titles('out')).toEqual(['Qty 00']);
  });
});
