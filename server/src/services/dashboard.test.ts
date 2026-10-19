import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { dashboardRangeQuerySchema } from '@inventory/shared';
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

const chartAt = (range: string, tz: string, now: string, days: { from?: string; to?: string } = {}) =>
  movementsChart(dashboardRangeQuerySchema.parse({ range, tz, ...days }), new Date(now));

const units = (bucketStart: string, receivedUnits: number) => ({
  bucketStart,
  receivedUnits,
  shippedUnits: 0,
  receivedValue: receivedUnits,
  shippedValue: 0,
});

describe('movementsChart', () => {
  it('cuts days at the viewer\'s midnight: 23:30 in Tehran (UTC+3:30) is that local day, not the next UTC one', async () => {
    // 2026-10-17 23:30 in Tehran is 20:00Z the same day; 2026-10-18 00:10 there is 20:40Z on the 17th in UTC
    await receive(4, '2026-10-17T20:00:00Z');
    await receive(6, '2026-10-17T20:40:00Z');

    const { buckets } = await chartAt('7d', 'Asia/Tehran', '2026-10-19T08:00:00Z');

    expect(buckets.slice(-3)).toEqual([
      units('2026-10-16T20:30:00.000Z', 4),
      units('2026-10-17T20:30:00.000Z', 6),
      units('2026-10-18T20:30:00.000Z', 0),
    ]);
  });

  it('a custom quarter is ISO weeks starting on local Mondays, the last day\'s week last, across a DST change', async () => {
    // Berlin leaves summer time on Sunday 2026-10-25: Monday midnights are 22:00Z before, 23:00Z after
    await receive(3, '2026-10-25T22:30:00Z'); // Sunday 23:30 CET: the week of Monday the 19th
    await receive(8, '2026-10-25T23:15:00Z'); // Monday 00:15 CET: the current week

    const chart = await chartAt('custom', 'Europe/Berlin', '2026-10-28T12:00:00Z', { from: '2026-08-05', to: '2026-10-28' });

    expect(chart.granularity).toBe('week');
    expect(chart.buckets).toHaveLength(13);
    expect(chart.buckets[0].bucketStart).toBe('2026-08-02T22:00:00.000Z'); // Monday Aug 3, the week of Wednesday Aug 5
    expect(chart.buckets.slice(-2)).toEqual([units('2026-10-18T22:00:00.000Z', 3), units('2026-10-25T23:00:00.000Z', 8)]);
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

    expect(buckets.map((bucket) => bucket.receivedUnits)).toEqual([0, 0, 0, 2, 5, 9, 0]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.receivedUnits, 0)).toBe(16);
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

  it('this month starts on the local 1st; a custom day that starts on a skipped midnight is still found', async () => {
    const month = await chartAt('month', 'Europe/Berlin', '2026-10-28T12:00:00Z');
    expect(month.granularity).toBe('day');
    expect(month.buckets).toHaveLength(28);
    expect(month.buckets[0].bucketStart).toBe('2026-09-30T22:00:00.000Z');

    // Santiago's 2026-09-06 starts at 01:00 local (04:00Z): one day is 24 hour buckets less the skipped one
    await receive(5, '2026-09-06T15:00:00Z');
    const day = await chartAt('custom', 'America/Santiago', '2026-09-08T15:00:00Z', { from: '2026-09-06', to: '2026-09-06' });
    expect(day.granularity).toBe('hour');
    expect(day.buckets[0].bucketStart).toBe('2026-09-06T04:00:00.000Z');
    expect(day.buckets).toHaveLength(23);
    expect(day.buckets.reduce((sum, bucket) => sum + bucket.receivedUnits, 0)).toBe(5);
  });

  it('today is hour buckets from local midnight to the current hour', async () => {
    const { granularity, buckets } = await chartAt('today', 'UTC', '2026-10-19T10:30:00Z');

    expect(granularity).toBe('hour');
    expect(buckets).toHaveLength(11);
    expect(buckets[0].bucketStart).toBe('2026-10-19T00:00:00.000Z');
    expect(buckets.at(-1)?.bucketStart).toBe('2026-10-19T10:00:00.000Z');
  });

  it('picks the bucket size from local days, so a 25-hour day (Berlin falls back on 2026-10-25) does not coarsen it', async () => {
    // 23:30 local on Oct 31: the month is 31 local days but 31 days and 1 hour long
    const month = await chartAt('month', 'Europe/Berlin', '2026-10-31T22:30:00Z');
    expect(month.granularity).toBe('day');
    expect(month.buckets).toHaveLength(31);

    const october = await chartAt('custom', 'Europe/Berlin', '2026-11-05T12:00:00Z', { from: '2026-10-01', to: '2026-10-31' });
    expect(october.granularity).toBe('day');
    expect(october.buckets).toHaveLength(31);

    // 23:45 local on the 25-hour day itself: 02:00 comes twice
    const today = await chartAt('today', 'Europe/Berlin', '2026-10-25T22:45:00Z');
    expect(today.granularity).toBe('hour');
    expect(today.buckets).toHaveLength(25);

    const day = await chartAt('custom', 'Europe/Berlin', '2026-11-05T12:00:00Z', { from: '2026-10-25', to: '2026-10-25' });
    expect(day.granularity).toBe('hour');
    expect(day.buckets).toHaveLength(25);
  });

  it('a custom range in the future has no buckets', async () => {
    const { buckets } = await chartAt('custom', 'UTC', '2026-10-19T08:00:00Z', { from: '2026-11-01', to: '2026-11-02' });
    expect(buckets).toEqual([]);
  });
});
