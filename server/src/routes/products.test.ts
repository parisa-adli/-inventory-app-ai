import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// Products over HTTP (#29): create, and the basic list (active only, title A→Z, 20 a page).

const app = createApp();

let counter = 0;
const sessionAs = async (role: 'admin' | 'staff') => {
  const user = await User.create({
    name: role,
    email: `products${++counter}@inventory.local`,
    role,
    status: 'active',
    emailVerified: true,
    passwordHash: 'unused',
  });
  return [`${ACCESS_COOKIE}=${signAccessToken(String(user._id))}`];
};

let staff: string[];
let categoryId: string;
let supplierId: string;

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
beforeEach(async () => {
  await clearMemoryDb();
  staff = await sessionAs('staff');
  categoryId = String((await Category.create({ title: 'Electronics' }))._id);
  supplierId = String((await Supplier.create({ name: 'TechSupply Co.' }))._id);
});

const validProduct = (extra: object = {}) => ({
  title: 'Wireless Mouse',
  sku: 'ele-001',
  category: categoryId,
  supplier: supplierId,
  costPrice: 12.5,
  salePrice: 24.99,
  unitOfMeasure: 'pcs',
  ...extra,
});

const create = (body: object, cookie = staff) => request(app).post('/api/products').set('Cookie', cookie).send(body);
const list = (query = '', cookie = staff) => request(app).get(`/api/products${query}`).set('Cookie', cookie);

describe('POST /api/products', () => {
  it('creates a product with zero stock that staff then see in the list', async () => {
    const created = await create(validProduct({ imageUrl: 'https://cdn.example.com/mouse.png' }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      title: 'Wireless Mouse',
      sku: 'ELE-001',
      category: { id: categoryId, name: 'Electronics' },
      supplier: { id: supplierId, name: 'TechSupply Co.' },
      costPrice: 12.5,
      salePrice: 24.99,
      quantity: 0,
      unitOfMeasure: 'pcs',
      imageUrl: 'https://cdn.example.com/mouse.png',
      status: 'active',
      archivedAt: null,
    });

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(res.body.items).toEqual([created.body]);
  });

  it('rejects a duplicate SKU, ignoring case and surrounding spaces', async () => {
    expect((await create(validProduct({ sku: 'ELE-001' }))).status).toBe(201);

    const res = await create(validProduct({ title: 'Another mouse', sku: '  ele-001 ' }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE_SKU', message: 'A product with SKU ELE-001 already exists.' });
    expect((await list()).body.total).toBe(1);
  });

  it('starts every product at 0: an explicit 0 is fine, any other quantity is rejected', async () => {
    const zero = await create(validProduct({ quantity: 0 }));
    expect(zero.status).toBe(201);
    expect(zero.body.quantity).toBe(0);

    const res = await create(validProduct({ sku: 'ELE-002', quantity: 5 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('quantity: Products start with 0 in stock');
  });

  it('leaves out the supplier and image when not given', async () => {
    const res = await create(validProduct({ supplier: undefined }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ supplier: null, imageUrl: null });
  });

  it.each([
    ['an SKU with other characters', { sku: 'ELE 001' }, 'sku: SKU may only contain letters, digits and dashes'],
    ['an SKU over 32 characters', { sku: 'A'.repeat(33) }, 'sku: SKU must be at most 32 characters'],
    ['a blank title', { title: '   ' }, 'title: Title is required'],
    ['a negative price', { costPrice: -1 }, 'costPrice: Cost price cannot be negative'],
    ['a price with 3 decimals', { salePrice: 1.999 }, 'salePrice: Sale price can have at most 2 decimals'],
    ['a price sent as text', { salePrice: '5' }, 'salePrice: Sale price must be a number'],
    ['an unknown unit', { unitOfMeasure: 'dozen' }, 'unitOfMeasure: Unit must be one of pcs, kg, box, l, m'],
    ['a non-http image URL', { imageUrl: 'ftp://cdn.example.com/a.png' }, 'imageUrl: Image URL must be an http(s) link'],
    ['no category', { category: undefined }, 'category:'],
    ['a malformed category id', { category: 'nope' }, 'category: Choose a category'],
    ['an unknown category', { category: '000000000000000000000000' }, 'category: Category not found'],
    ['an unknown supplier', { supplier: '000000000000000000000000' }, 'supplier: Supplier not found'],
  ])('rejects %s with 400', async (_case, override, message) => {
    const res = await create(validProduct(override));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain(message);
    expect((await list()).body.total).toBe(0);
  });

  it('accepts a sale price below cost and whole or 2-decimal prices', async () => {
    const res = await create(validProduct({ costPrice: 10, salePrice: 0.5 }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ costPrice: 10, salePrice: 0.5 });
  });
});

describe('GET /api/products', () => {
  const seed = async (titles: string[], extra: object = {}) => {
    for (const [i, title] of titles.entries()) {
      const res = await create(validProduct({ title, sku: `SKU-${title.replace(/\W/g, '')}-${i}`, ...extra }));
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
  };

  it('lists active products only, title A→Z case-insensitively', async () => {
    await seed(['banana', 'Apple', 'cherry', 'Retired']);
    await Product.updateOne({ title: 'Retired' }, { archivedAt: new Date() });

    const res = await list();
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((p: { title: string }) => p.title)).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('pages 20 at a time by default and honours page/limit', async () => {
    await seed(Array.from({ length: 21 }, (_, i) => `Item ${String(i + 1).padStart(2, '0')}`));

    const first = await list();
    expect(first.body).toMatchObject({ page: 1, limit: 20, total: 21, totalPages: 2 });
    expect(first.body.items).toHaveLength(20);

    const second = await list('?page=2');
    expect(second.body.items.map((p: { title: string }) => p.title)).toEqual(['Item 21']);

    expect((await list('?limit=101')).status).toBe(400);
  });

  it('searches title and SKU case-insensitively, treating regex characters literally', async () => {
    await seed(['Wireless Mouse', 'USB Cable (2m)', 'Desk Lamp']);
    const titles = async (search: string) =>
      (await list(`?search=${encodeURIComponent(search)}`)).body.items.map((p: { title: string }) => p.title);

    expect(await titles('mouse')).toEqual(['Wireless Mouse']);
    expect(await titles('sku-desk')).toEqual(['Desk Lamp']);
    expect(await titles('(2m)')).toEqual(['USB Cable (2m)']);
    expect(await titles('.*')).toEqual([]);
    expect(await titles('  ')).toEqual(['Desk Lamp', 'USB Cable (2m)', 'Wireless Mouse']);
  });

  it('shows an unassigned supplier as null', async () => {
    await seed(['Loose screws'], { supplier: undefined });
    expect((await list()).body.items[0].supplier).toBeNull();
  });
});
