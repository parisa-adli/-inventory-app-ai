import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Supplier } from '../models/Supplier.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { PRODUCTS_COLLECTION } from '../services/productRefs.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../test/db.js';

// Categories and suppliers share one service (services/catalog.ts); each rule is tested on the entity
// where it is most visible, the shared ones on both. Products do not exist yet (P3), so tests insert
// raw documents into the products collection.

const app = createApp();

let counter = 0;
const sessionAs = async (role: 'admin' | 'staff') => {
  const user = await User.create({
    name: role,
    email: `catalog${++counter}@inventory.local`,
    role,
    status: 'active',
    emailVerified: true,
    passwordHash: 'unused',
  });
  return [`${ACCESS_COOKIE}=${signAccessToken(String(user._id))}`];
};

const insertProducts = (docs: object[]) =>
  mongoose.connection.collection(PRODUCTS_COLLECTION).insertMany(docs.map((doc) => ({ title: 'P', ...doc })));

let admin: string[];

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  await mongoose.connection.collection(PRODUCTS_COLLECTION).deleteMany({});
  admin = await sessionAs('admin');
});

const ENTITIES = [
  { path: '/api/categories', nameField: 'title', model: Category, duplicate: 'DUPLICATE_CATEGORY', inUse: 'CATEGORY_IN_USE', ref: 'category' },
  { path: '/api/suppliers', nameField: 'name', model: Supplier, duplicate: 'DUPLICATE_SUPPLIER', inUse: 'SUPPLIER_IN_USE', ref: 'supplier' },
] as const;

describe.each(ENTITIES)('$path', ({ path, nameField, model, duplicate, inUse, ref }) => {
  const create = (name: string, extra: object = {}) =>
    request(app).post(path).set('Cookie', admin).send({ [nameField]: name, ...extra });

  it('creates a record and lists it with productCount, never exposing the normalized key', async () => {
    const created = await create('  Snack Food ');
    expect(created.status).toBe(201);
    expect(created.body[nameField]).toBe('Snack Food');
    expect(created.body).not.toHaveProperty('productCount');
    expect(created.body).not.toHaveProperty(`${nameField}Key`);

    const list = await request(app).get(path).set('Cookie', await sessionAs('staff'));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ page: 1, limit: 12, total: 1, totalPages: 1 });
    expect(list.body.items[0]).toMatchObject({ id: created.body.id, [nameField]: 'Snack Food', productCount: 0 });
    expect(list.body.items[0]).not.toHaveProperty(`${nameField}Key`);
  });

  it('lets staff create and edit, but not delete (PRD §2)', async () => {
    const staff = await sessionAs('staff');
    const created = await request(app).post(path).set('Cookie', staff).send({ [nameField]: 'Snacks' });
    expect(created.status).toBe(201);

    const renamed = await request(app).patch(`${path}/${created.body.id}`).set('Cookie', staff).send({ [nameField]: 'Treats' });
    expect(renamed.status).toBe(200);
    expect(renamed.body[nameField]).toBe('Treats');

    const del = await request(app).delete(`${path}/${created.body.id}`).set('Cookie', staff);
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe('FORBIDDEN');
    expect(await model.countDocuments()).toBe(1);
  });

  it('rejects a name that differs only in case or spacing (409)', async () => {
    await create('  snack   food ');
    const res = await create('Snack Food');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(duplicate);
  });

  it('rejects renaming onto another record, but allows a case change of its own name', async () => {
    await create('Snacks');
    const other = await create('Drinks');

    const clash = await request(app).patch(`${path}/${other.body.id}`).set('Cookie', admin).send({ [nameField]: 'SNACKS' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe(duplicate);

    const recase = await request(app).patch(`${path}/${other.body.id}`).set('Cookie', admin).send({ [nameField]: 'DRINKS' });
    expect(recase.status).toBe(200);
    expect(recase.body[nameField]).toBe('DRINKS');
  });

  it('does not let the name be cleared or emptied', async () => {
    const created = await create('Snacks');
    for (const value of [null, '   ']) {
      const res = await request(app).patch(`${path}/${created.body.id}`).set('Cookie', admin).send({ [nameField]: value });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects an empty PATCH body', async () => {
    const created = await create('Snacks');
    const res = await request(app).patch(`${path}/${created.body.id}`).set('Cookie', admin).send({});
    expect(res.status).toBe(400);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    for (const id of ['000000000000000000000000', 'not-an-id']) {
      const patch = await request(app).patch(`${path}/${id}`).set('Cookie', admin).send({ [nameField]: 'X' });
      expect(patch.status).toBe(404);
      const del = await request(app).delete(`${path}/${id}`).set('Cookie', admin);
      expect(del.status).toBe(404);
    }
  });

  it('blocks delete while any product uses it, archived ones included, and counts them in the list', async () => {
    const created = await create('Snacks');
    const id = new mongoose.Types.ObjectId(String(created.body.id));
    await insertProducts([
      { [ref]: id, status: 'active' },
      { [ref]: id, status: 'archived' },
    ]);

    const list = await request(app).get(path).set('Cookie', admin);
    expect(list.body.items[0].productCount).toBe(2);

    const res = await request(app).delete(`${path}/${created.body.id}`).set('Cookie', admin);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: inUse, details: { productCount: 2, archivedCount: 1 } });
    expect(await model.countDocuments()).toBe(1);

    await mongoose.connection.collection(PRODUCTS_COLLECTION).deleteMany({});
    const ok = await request(app).delete(`${path}/${created.body.id}`).set('Cookie', admin);
    expect(ok.status).toBe(204);
    expect(await model.countDocuments()).toBe(0);
  });

  it('pages with prev/next metadata', async () => {
    for (let i = 1; i <= 5; i++) await create(`Item ${i}`);
    const res = await request(app).get(`${path}?limit=2&page=3`).set('Cookie', admin);
    expect(res.body).toMatchObject({ page: 3, limit: 2, total: 5, totalPages: 3 });
    expect(res.body.items.map((item: Record<string, string>) => item[nameField])).toEqual(['Item 5']);

    const tooBig = await request(app).get(`${path}?limit=101`).set('Cookie', admin);
    expect(tooBig.status).toBe(400);
  });

  it('sorts by name (case-insensitive) asc by default, newest first, and most products first', async () => {
    const banana = await create('banana');
    await create('Apple');
    const cherry = await create('Cherry');
    await insertProducts([{ [ref]: new mongoose.Types.ObjectId(String(cherry.body.id)) }]);
    // createdAt is immutable through Mongoose, so set it on the raw collection
    await model.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(String(banana.body.id)) },
      { $set: { createdAt: new Date('2030-01-01') } }
    );

    const names = async (query: string) =>
      (await request(app).get(`${path}${query}`).set('Cookie', admin)).body.items.map(
        (item: Record<string, string>) => item[nameField]
      );

    expect(await names('')).toEqual(['Apple', 'banana', 'Cherry']);
    expect(await names('?sort=name&order=desc')).toEqual(['Cherry', 'banana', 'Apple']);
    expect((await names('?sort=createdAt'))[0]).toBe('banana');
    // Ties (0 products) fall back to name A→Z
    expect(await names('?sort=productCount')).toEqual(['Cherry', 'Apple', 'banana']);
  });

  it('searches case-insensitively and treats regex characters literally', async () => {
    await create('A.B Traders');
    await create('AxB Traders');
    await create('(Paren)');

    const search = async (term: string) =>
      (await request(app).get(`${path}?search=${encodeURIComponent(term)}`).set('Cookie', admin)).body.total;

    expect(await search('a.b')).toBe(1);
    expect(await search('(')).toBe(1);
    expect(await search('traders')).toBe(2);
    expect(await search('   ')).toBe(3);
  });
});

describe('categories fields', () => {
  it('searches the description and clears it with null', async () => {
    const created = await request(app)
      .post('/api/categories')
      .set('Cookie', admin)
      .send({ title: 'Snacks', description: 'Crisps and nuts' });
    expect(created.body.description).toBe('Crisps and nuts');

    const found = await request(app).get('/api/categories?search=NUTS').set('Cookie', admin);
    expect(found.body.total).toBe(1);

    const cleared = await request(app)
      .patch(`/api/categories/${created.body.id}`)
      .set('Cookie', admin)
      .send({ description: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.description).toBeNull();
    const stored = await Category.findById(created.body.id).lean();
    expect(stored).not.toHaveProperty('description');
  });

  it('rejects an empty description on create (leave it out instead)', async () => {
    const res = await request(app).post('/api/categories').set('Cookie', admin).send({ title: 'Snacks', description: '' });
    expect(res.status).toBe(400);
  });
});

describe('suppliers fields', () => {
  const full = {
    name: 'TechSupply Co.',
    contactPerson: 'Michael Chen',
    phone: '+1-555-0101',
    email: 'Orders@TechSupply.com',
    address: '123 Tech Avenue',
    notes: 'Net-30',
  };

  it('stores every field, lowercases the email and searches contact person and email', async () => {
    const created = await request(app).post('/api/suppliers').set('Cookie', admin).send(full);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...full, email: 'orders@techsupply.com' });

    for (const term of ['michael', 'techsupply.com']) {
      const res = await request(app).get(`/api/suppliers?search=${term}`).set('Cookie', admin);
      expect(res.body.total).toBe(1);
    }
    // Notes and address are not searched
    expect((await request(app).get('/api/suppliers?search=Net-30').set('Cookie', admin)).body.total).toBe(0);
  });

  it('clears optional fields with null and leaves absent ones alone', async () => {
    const created = await request(app).post('/api/suppliers').set('Cookie', admin).send(full);
    const res = await request(app)
      .patch(`/api/suppliers/${created.body.id}`)
      .set('Cookie', admin)
      .send({ email: null, phone: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: null, phone: null, contactPerson: 'Michael Chen', notes: 'Net-30' });
  });

  it('validates email and phone', async () => {
    for (const bad of [{ email: 'not-an-email' }, { email: '' }, { phone: 'call me' }]) {
      const res = await request(app).post('/api/suppliers').set('Cookie', admin).send({ name: 'X', ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
