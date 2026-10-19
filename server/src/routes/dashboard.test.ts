import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { StockMovement } from '../models/StockMovement.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';

// The dashboard's In-vs-Out chart (#55, C26): receive vs ship per day or ISO week, cut in the viewer's timezone.

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
        received: 0,
        shipped: 0,
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
    expect(res.body.buckets.map(({ received, shipped }: { received: number; shipped: number }) => [received, shipped])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [12, 3],
      [0, 2],
    ]);
  });
});
