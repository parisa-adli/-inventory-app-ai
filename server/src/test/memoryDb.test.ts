import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Category } from '../models/Category.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from './memoryDb.js';

// Proves the in-memory harness the stock and product tests will use: its own mongod, real indexes, clean between tests

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
beforeEach(clearMemoryDb);

describe('mongodb-memory-server harness', () => {
  it('runs on its own mongod, not the local test database', () => {
    const { host, port, name } = mongoose.connection;
    const local = new URL(env.MONGODB_URI);
    expect(name).toBe('inventory_memory_test');
    expect(`${host}:${port}`).not.toBe(`${local.hostname}:${local.port || 27017}`);
  });

  it('stores documents and enforces model indexes', async () => {
    await Category.create({ title: 'Electronics' });
    await expect(Category.create({ title: ' electronics ' })).rejects.toMatchObject({ code: 11000 });
    expect(await Category.countDocuments()).toBe(1);
  });

  it('starts every test empty', async () => {
    expect(await Category.countDocuments()).toBe(0);
  });
});
