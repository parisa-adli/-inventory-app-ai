import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { movementsChartQuerySchema } from '@inventory/shared';
import { StockMovement } from '../models/StockMovement.js';
import { MEMORY_DB_START_TIMEOUT_MS, clearMemoryDb, connectMemoryDb, disconnectMemoryDb } from '../test/memoryDb.js';
import { movementsChart } from './dashboard.js';

// The chart's calendar (#55, C26) with "now" pinned: local midnights, Monday weeks, DST. The HTTP side is in
// routes/dashboard.test.ts.

beforeAll(connectMemoryDb, MEMORY_DB_START_TIMEOUT_MS);
afterAll(disconnectMemoryDb);
beforeEach(clearMemoryDb);

const receive = (delta: number, occurredAt: string) =>
  StockMovement.create({
    product: new Types.ObjectId(),
    type: 'receive',
    delta,
    quantityAfter: delta,
    unitCost: 1,
    unitPrice: 2,
    user: new Types.ObjectId(),
    occurredAt: new Date(occurredAt),
  });

const chartAt = (range: string, tz: string, now: string) =>
  movementsChart(movementsChartQuerySchema.parse({ range, tz }), new Date(now));

describe('movementsChart', () => {
  it('cuts days at the viewer\'s midnight: 23:30 in Tehran (UTC+3:30) is that local day, not the next UTC one', async () => {
    // 2026-10-17 23:30 in Tehran is 20:00Z the same day; 2026-10-18 00:10 there is 20:40Z on the 17th in UTC
    await receive(4, '2026-10-17T20:00:00Z');
    await receive(6, '2026-10-17T20:40:00Z');

    const { buckets } = await chartAt('7d', 'Asia/Tehran', '2026-10-19T08:00:00Z');

    expect(buckets.slice(-3)).toEqual([
      { bucketStart: '2026-10-16T20:30:00.000Z', received: 4, shipped: 0 },
      { bucketStart: '2026-10-17T20:30:00.000Z', received: 6, shipped: 0 },
      { bucketStart: '2026-10-18T20:30:00.000Z', received: 0, shipped: 0 },
    ]);
  });

  it('90d is 13 ISO weeks starting on local Mondays, the current week last, across a DST change', async () => {
    // Berlin leaves summer time on Sunday 2026-10-25: Monday midnights are 22:00Z before, 23:00Z after
    await receive(3, '2026-10-25T22:30:00Z'); // Sunday 23:30 CET: the week of Monday the 19th
    await receive(8, '2026-10-25T23:15:00Z'); // Monday 00:15 CET: the current week

    const chart = await chartAt('90d', 'Europe/Berlin', '2026-10-28T12:00:00Z'); // a Wednesday

    expect(chart.granularity).toBe('week');
    expect(chart.buckets).toHaveLength(13);
    expect(chart.buckets[0].bucketStart).toBe('2026-08-02T22:00:00.000Z');
    expect(chart.buckets.slice(-2)).toEqual([
      { bucketStart: '2026-10-18T22:00:00.000Z', received: 3, shipped: 0 },
      { bucketStart: '2026-10-25T23:00:00.000Z', received: 8, shipped: 0 },
    ]);
    for (const { bucketStart } of chart.buckets) {
      const local = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      expect(local.format(new Date(bucketStart))).toBe('Mon 00:00');
    }
  });

  it('counts a day whose midnight does not exist (Santiago springs forward 00:00 → 01:00 on 2026-09-06)', async () => {
    await receive(2, '2026-09-05T15:00:00Z'); // Saturday noon, -04
    await receive(5, '2026-09-06T15:00:00Z'); // Sunday noon, -03
    await receive(9, '2026-09-07T15:00:00Z'); // Monday noon

    const { buckets } = await chartAt('7d', 'America/Santiago', '2026-09-08T15:00:00Z');

    expect(buckets.map((bucket) => bucket.received)).toEqual([0, 0, 0, 2, 5, 9, 0]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.received, 0)).toBe(16);
  });

  it('30d is 30 local days, today last, with the 25-hour day on its own midnights', async () => {
    const { granularity, buckets } = await chartAt('30d', 'Europe/Berlin', '2026-10-28T12:00:00Z');

    expect(granularity).toBe('day');
    expect(buckets).toHaveLength(30);
    expect(buckets[0].bucketStart).toBe('2026-09-28T22:00:00.000Z');
    expect(buckets.slice(-4).map((bucket) => bucket.bucketStart)).toEqual([
      '2026-10-24T22:00:00.000Z',
      '2026-10-25T23:00:00.000Z',
      '2026-10-26T23:00:00.000Z',
      '2026-10-27T23:00:00.000Z',
    ]);
  });
});
