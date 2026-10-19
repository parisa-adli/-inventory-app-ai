import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// Products over HTTP (#29, #34, #35): create, edit (PATCH), and the list with its filters and sorts.

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

describe('PATCH /api/products/:id', () => {
  const edit = (id: string, body: object, cookie = staff) =>
    request(app).patch(`/api/products/${id}`).set('Cookie', cookie).send(body);
  const createdId = async (extra: object = {}) => {
    const res = await create(validProduct(extra));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };

  it('lets staff and admins edit every field but quantity, and the list shows the change', async () => {
    const id = await createdId({ imageUrl: 'https://cdn.example.com/mouse.png' });
    const office = String((await Category.create({ title: 'Office' }))._id);
    const other = String((await Supplier.create({ name: 'Paper Partners' }))._id);

    const res = await edit(id, {
      title: 'Ergonomic Mouse',
      sku: ' ele-100 ',
      category: office,
      supplier: other,
      costPrice: 15,
      salePrice: 29.5,
      unitOfMeasure: 'box',
      imageUrl: 'https://cdn.example.com/ergo.png',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id,
      title: 'Ergonomic Mouse',
      sku: 'ELE-100',
      category: { id: office, name: 'Office' },
      supplier: { id: other, name: 'Paper Partners' },
      costPrice: 15,
      salePrice: 29.5,
      quantity: 0,
      unitOfMeasure: 'box',
      imageUrl: 'https://cdn.example.com/ergo.png',
      status: 'active',
    });
    expect((await list()).body.items).toEqual([res.body]);

    const byAdmin = await edit(id, { title: 'Admin Mouse' }, await sessionAs('admin'));
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.title).toBe('Admin Mouse');
  });

  it('keeps absent fields and clears the supplier and image with null, so the product is Unassigned', async () => {
    const id = await createdId({ imageUrl: 'https://cdn.example.com/mouse.png' });

    const res = await edit(id, { supplier: null, imageUrl: null });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Wireless Mouse',
      sku: 'ELE-001',
      category: { id: categoryId, name: 'Electronics' },
      supplier: null,
      imageUrl: null,
      costPrice: 12.5,
    });
    const unassigned = await list('?supplier=unassigned');
    expect(unassigned.body.items.map((p: { id: string }) => p.id)).toEqual([id]);
  });

  it('rejects quantity, even alongside other fields, and changes nothing', async () => {
    const id = await createdId();

    for (const body of [{ quantity: 5 }, { title: 'Sneaky', quantity: 0 }]) {
      const res = await edit(id, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'body: Quantity cannot be edited; record a stock movement instead',
      });
    }
    expect((await list()).body.items[0]).toMatchObject({ title: 'Wireless Mouse', quantity: 0 });
  });

  it('rejects any other unknown field', async () => {
    const res = await edit(await createdId(), { title: 'Mouse', status: 'archived' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Unrecognized key');
  });

  it('answers a clear 409 when the new SKU belongs to another product, ignoring case', async () => {
    await createdId({ sku: 'ELE-002' });
    const id = await createdId();

    const res = await edit(id, { sku: ' ele-002' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE_SKU', message: 'A product with SKU ELE-002 already exists.' });
    // Saving a product's own SKU again is not a clash
    expect((await edit(id, { sku: 'ELE-001', title: 'Same SKU' })).status).toBe(200);
  });

  it.each([
    ['an empty body', {}, 'Send at least one field to change'],
    ['a cleared title', { title: '' }, 'title: Title is required'],
    ['a cleared category', { category: null }, 'category:'],
    ['an unknown category', { category: '000000000000000000000000' }, 'category: Category not found'],
    ['an unknown supplier', { supplier: '000000000000000000000000' }, 'supplier: Supplier not found'],
    ['a bad SKU', { sku: 'ELE 1' }, 'sku: SKU may only contain letters, digits and dashes'],
    ['a negative price', { salePrice: -1 }, 'salePrice: Sale price cannot be negative'],
  ])('rejects %s with 400', async (_case, body, message) => {
    const res = await edit(await createdId(), body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain(message);
  });

  it('edits an archived product, which stays archived (only its stock is frozen)', async () => {
    const id = await createdId();
    await Product.updateOne({ _id: id }, { archivedAt: new Date() });

    const res = await edit(id, { title: 'Retired Mouse' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Retired Mouse', status: 'archived' });
  });

  it('answers 404 for a product that does not exist', async () => {
    for (const id of [String(new Types.ObjectId()), 'not-an-id']) {
      const res = await edit(id, { title: 'Ghost' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('PATCH /api/products/supplier', () => {
  const assign = (body: object, cookie = staff) =>
    request(app).patch('/api/products/supplier').set('Cookie', cookie).send(body);
  const twoProducts = async () => [
    (await create(validProduct({ supplier: undefined }))).body.id as string,
    (await create(validProduct({ sku: 'ele-002' }))).body.id as string,
  ];

  it('sets one supplier on every selected product', async () => {
    const otherId = String((await Supplier.create({ name: 'Global Parts' }))._id);
    const ids = await twoProducts();

    const res = await assign({ ids, supplier: otherId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    const { body } = await list();
    expect(body.items.map((p: { supplier: { id: string } }) => p.supplier.id)).toEqual([otherId, otherId]);
  });

  it('makes them Unassigned with null', async () => {
    const ids = await twoProducts();
    expect((await assign({ ids, supplier: null })).status).toBe(200);
    expect((await list('?supplier=unassigned')).body.total).toBe(2);
  });

  it('refuses an unknown supplier and changes nothing', async () => {
    const ids = await twoProducts();
    const res = await assign({ ids, supplier: String(new Types.ObjectId()) });
    expect(res.status).toBe(400);
    expect((await list('?supplier=unassigned')).body.total).toBe(1);
  });

  it('is a 404 when a selected product no longer exists, and changes nothing', async () => {
    const [id] = await twoProducts();
    const res = await assign({ ids: [id, String(new Types.ObjectId())], supplier: null });
    expect(res.status).toBe(404);
    expect((await list('?supplier=unassigned')).body.total).toBe(1);
  });

  it.each([
    ['no ids', { ids: [], supplier: null }],
    ['a malformed id', { ids: ['nope'], supplier: null }],
    ['no supplier field', { ids: [String(new Types.ObjectId())] }],
    ['an unknown field', { ids: [String(new Types.ObjectId())], supplier: null, quantity: 5 }],
  ])('rejects a body with %s', async (_, body) => {
    expect((await assign(body)).status).toBe(400);
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

// #34: filters, sorts and the archived tab
describe('GET /api/products filters and sorts', () => {
  interface Listed {
    id: string;
    title: string;
    sku: string;
    quantity: number;
    costPrice: number;
    salePrice: number;
    createdAt: string;
    supplier: { id: string } | null;
    category: { id: string };
    status: string;
  }

  const add = async (title: string, extra: object = {}) => {
    const res = await create(validProduct({ title, sku: `SKU-${title.replace(/\W/g, '')}`, ...extra }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Listed;
  };
  /** Test setup only: the app changes quantity through the stock module alone. */
  const setQuantity = (id: string, quantity: number) => Product.updateOne({ _id: id }, { quantity });
  const titles = async (query: string) => {
    const res = await list(query);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body.items as Listed[]).map((p) => p.title);
  };

  it('buckets stock status at 0, 1, 10 and 11 with the shared threshold', async () => {
    for (const quantity of [0, 1, 10, 11]) await setQuantity((await add(`Qty ${quantity}`)).id, quantity);

    expect(await titles('?stockStatus=out')).toEqual(['Qty 0']);
    expect(await titles('?stockStatus=low')).toEqual(['Qty 1', 'Qty 10']);
    expect(await titles('?stockStatus=in')).toEqual(['Qty 11']);
    expect(await titles('')).toEqual(['Qty 0', 'Qty 1', 'Qty 10', 'Qty 11']);
  });

  it('filters by supplier, where "unassigned" is exactly the products without one', async () => {
    const otherSupplier = String((await Supplier.create({ name: 'Other Co.' }))._id);
    await add('Has supplier');
    await add('Other supplier', { supplier: otherSupplier });
    await add('No supplier A', { supplier: undefined });
    await add('No supplier B', { supplier: undefined });

    expect(await titles('?supplier=unassigned')).toEqual(['No supplier A', 'No supplier B']);
    expect(await titles(`?supplier=${supplierId}`)).toEqual(['Has supplier']);
    expect(await titles(`?supplier=${otherSupplier}`)).toEqual(['Other supplier']);
  });

  it('filters by category', async () => {
    const tools = String((await Category.create({ title: 'Tools' }))._id);
    await add('Mouse');
    await add('Hammer', { category: tools });

    expect(await titles(`?category=${tools}`)).toEqual(['Hammer']);
    expect(await titles(`?category=${categoryId}`)).toEqual(['Mouse']);
  });

  it('shows active products by default and archived ones under status=archived', async () => {
    await add('Current');
    const retired = await add('Retired');
    await Product.updateOne({ _id: retired.id }, { archivedAt: new Date() });

    expect(await titles('')).toEqual(['Current']);
    expect(await titles('?status=active')).toEqual(['Current']);
    const archived = await list('?status=archived');
    expect(archived.body).toMatchObject({ total: 1, items: [{ title: 'Retired', status: 'archived' }] });
  });

  it('combines search and filters', async () => {
    await setQuantity((await add('Blue Mouse')).id, 5);
    await setQuantity((await add('Red Mouse', { supplier: undefined })).id, 5);
    await setQuantity((await add('Green Mouse')).id, 50);

    expect(await titles(`?search=mouse&stockStatus=low&supplier=${supplierId}`)).toEqual(['Blue Mouse']);
  });

  it.each(['title', 'sku', 'quantity', 'costPrice', 'salePrice', 'createdAt'] as const)(
    'sorts by %s in both directions, ties broken by id in the same direction',
    async (sort) => {
      // Two of each value, so every sort has ties to break; titles and SKUs differ only in case
      const values = [
        { title: 'b', sku: 'B', quantity: 3, costPrice: 2, salePrice: 9 },
        { title: 'A', sku: 'a', quantity: 1, costPrice: 1, salePrice: 5 },
        { title: 'a', sku: 'A', quantity: 1, costPrice: 1, salePrice: 5 },
        { title: 'B', sku: 'b', quantity: 3, costPrice: 2, salePrice: 9 },
      ];
      const created: Listed[] = [];
      for (const [i, value] of values.entries()) {
        const res = await create(
          validProduct({ title: value.title, sku: `${value.sku}-${i % 2}`, costPrice: value.costPrice, salePrice: value.salePrice })
        );
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        await setQuantity(res.body.id, value.quantity);
        created.push({ ...res.body, quantity: value.quantity });
      }
      // createdAt ties too: give pairs the same timestamp
      if (sort === 'createdAt') {
        const stamps = [new Date('2026-01-02'), new Date('2026-01-01')];
        for (const [i, product] of created.entries()) {
          const createdAt = stamps[i % 2]!;
          await Product.collection.updateOne({ _id: new Types.ObjectId(product.id) }, { $set: { createdAt } });
          product.createdAt = createdAt.toISOString();
        }
      }

      const key = (p: Listed): string | number => {
        if (sort === 'title' || sort === 'sku') return p[sort].toLowerCase();
        if (sort === 'createdAt') return Date.parse(p.createdAt);
        return p[sort];
      };
      for (const order of ['asc', 'desc'] as const) {
        const sign = order === 'asc' ? 1 : -1;
        const expected = [...created]
          .sort((x, y) => {
            const a = key(x);
            const b = key(y);
            if (a !== b) return (a < b ? -1 : 1) * sign;
            return (x.id < y.id ? -1 : 1) * sign;
          })
          .map((p) => p.id);
        const res = await list(`?sort=${sort}&order=${order}`);
        expect(res.status).toBe(200);
        expect((res.body.items as Listed[]).map((p) => p.id), `${sort} ${order}`).toEqual(expected);

        // Stable across pages: one row a page walks the same order
        const paged: string[] = [];
        for (let page = 1; page <= created.length; page++) {
          paged.push(...(await list(`?sort=${sort}&order=${order}&limit=1&page=${page}`)).body.items.map((p: Listed) => p.id));
        }
        expect(paged).toEqual(expected);
      }
    }
  );

  it('defaults to A→Z for title and SKU and to highest/newest first otherwise', async () => {
    await setQuantity((await add('Alpha')).id, 1);
    await setQuantity((await add('Beta')).id, 2);

    expect(await titles('?sort=title')).toEqual(['Alpha', 'Beta']);
    expect(await titles('?sort=sku')).toEqual(['Alpha', 'Beta']);
    expect(await titles('?sort=quantity')).toEqual(['Beta', 'Alpha']);
  });

  it.each([
    ['an unknown sort', '?sort=category'],
    ['an unknown order', '?order=up'],
    ['an unknown stock status', '?stockStatus=empty'],
    ['an unknown status', '?status=deleted'],
    ['a malformed supplier', '?supplier=nobody'],
    ['a malformed category', '?category=nope'],
  ])('rejects %s with 400', async (_case, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// #36: admin-only archive, unarchive and delete
describe('archive, unarchive and delete', () => {
  let admin: string[];
  beforeEach(async () => {
    admin = await sessionAs('admin');
  });

  const createdId = async () => {
    const res = await create(validProduct());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };
  const archive = (id: string, cookie = admin) => request(app).patch(`/api/products/${id}/archive`).set('Cookie', cookie);
  const unarchive = (id: string, cookie = admin) => request(app).patch(`/api/products/${id}/unarchive`).set('Cookie', cookie);
  const remove = (id: string, cookie = admin) => request(app).delete(`/api/products/${id}`).set('Cookie', cookie);
  const receive = (productId: string, quantity = 1) =>
    request(app).post('/api/stock-movements').set('Cookie', staff).send({ productId, type: 'receive', quantity });
  const history = (productId: string) => request(app).get(`/api/stock-movements?product=${productId}`).set('Cookie', staff);

  it('archives a product with stock on hand: it moves to the Archived tab, keeps its history and refuses stock changes', async () => {
    const id = await createdId();
    expect((await receive(id, 5)).status).toBe(201);

    const res = await archive(id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'archived', quantity: 5 });
    expect(res.body.archivedAt).toEqual(expect.any(String));

    expect((await list()).body.total).toBe(0);
    expect((await list('?status=archived')).body.items.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await history(id)).body).toMatchObject({ total: 1, items: [{ delta: 5, quantityAfter: 5 }] });

    const refused = await receive(id);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PRODUCT_ARCHIVED');
  });

  it('unarchives a product: it is back in the active list and accepts stock changes', async () => {
    const id = await createdId();
    const first = await archive(id);
    // Archiving again keeps the original date
    expect((await archive(id)).body.archivedAt).toBe(first.body.archivedAt);

    const res = await unarchive(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: 'active', archivedAt: null });
    expect((await list()).body.items.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await receive(id)).status).toBe(201);
    expect((await unarchive(id)).body.status).toBe('active');
  });

  it('deletes a product that never had a movement', async () => {
    const id = await createdId();

    const res = await remove(id);
    expect(res.status).toBe(204);
    expect((await list()).body.total).toBe(0);
    expect((await remove(id)).status).toBe(404);
  });

  it('refuses to delete a product with movements, even back at 0, and says how many', async () => {
    const id = await createdId();
    await receive(id, 2);
    await request(app).post('/api/stock-movements').set('Cookie', staff).send({ productId: id, type: 'ship', quantity: 2 });

    const res = await remove(id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'PRODUCT_HAS_MOVEMENTS', details: { movementCount: 2 } });
    expect(res.body.error.message).toContain('Archive it instead');
    expect((await list()).body.total).toBe(1);
  });

  it('refuses an archived product with movements too, and deletes an archived one without', async () => {
    const stocked = await createdId();
    await receive(stocked);
    await archive(stocked);
    expect((await remove(stocked)).body.error.code).toBe('PRODUCT_HAS_MOVEMENTS');

    const res = await create(validProduct({ sku: 'ELE-002' }));
    await archive(res.body.id);
    expect((await remove(res.body.id)).status).toBe(204);
  });

  it('answers 404 for a product that does not exist', async () => {
    for (const id of [String(new Types.ObjectId()), 'not-an-id']) {
      for (const res of [await archive(id), await unarchive(id), await remove(id)]) {
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      }
    }
  });

  it('refuses staff with 403 and changes nothing', async () => {
    const id = await createdId();
    for (const res of [await archive(id, staff), await unarchive(id, staff), await remove(id, staff)]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect((await list()).body.items).toMatchObject([{ id, status: 'active' }]);
  });
});
