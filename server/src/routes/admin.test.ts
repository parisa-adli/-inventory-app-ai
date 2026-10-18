import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { recordMovement } from '../services/stock.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// GET /api/admin/reconcile over HTTP (#37). The checks themselves are in services/stock.test.ts; the staff 403 is in the access matrix.

const app = createApp();

let cookie: string[];
let productId: string;

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
beforeEach(async () => {
  await clearMemoryDb();
  const admin = await User.create({
    name: 'Ada Admin',
    email: 'ada@inventory.local',
    role: 'admin',
    status: 'active',
    emailVerified: true,
    passwordHash: 'unused',
  });
  cookie = [`${ACCESS_COOKIE}=${signAccessToken(String(admin._id))}`];
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
  await recordMovement({ productId, type: 'receive', quantity: 5, userId: String(admin._id) });
  await Product.updateOne({ _id: productId }, { quantity: 9 }); // drift: the ledger says 5
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const reconcile = (query = '') => request(app).get(`/api/admin/reconcile${query}`).set('Cookie', cookie);
const quantity = async () => (await Product.findById(productId).lean())?.quantity;

describe('GET /api/admin/reconcile', () => {
  const mismatch = () => ({ productId, sku: 'ELE-001', quantity: 9, ledgerSum: 5 });

  it('reports the drift without changing anything', async () => {
    const res = await reconcile();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ checked: 1, mismatches: [mismatch()] });
    expect(await quantity()).toBe(9);
  });

  it('repairs it with fix=true, after which the check is clean', async () => {
    const res = await reconcile('?fix=true');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ checked: 1, mismatches: [{ ...mismatch(), fixed: true }] });
    expect(await quantity()).toBe(5);
    expect((await reconcile()).body).toEqual({ checked: 1, mismatches: [] });
  });

  it('treats fix=false as a plain check', async () => {
    expect((await reconcile('?fix=false')).body).toEqual({ checked: 1, mismatches: [mismatch()] });
    expect(await quantity()).toBe(9);
  });

  it('refuses a fix value that is not a boolean with 400 VALIDATION_ERROR', async () => {
    const res = await reconcile('?fix=please');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await quantity()).toBe(9);
  });
});
