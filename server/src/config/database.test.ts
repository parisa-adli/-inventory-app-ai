import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmailToken, EMAIL_TOKEN_PURGE_AFTER_SECONDS } from '../models/EmailToken.js';
import { connectTestDb, disconnectTestDb } from '../test/db.js';
import { syncEmailTokenIndexes } from './database.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const expiresAtIndex = async () =>
  (await EmailToken.collection.indexes()).find((index) => index.key.expiresAt === 1);

describe('syncEmailTokenIndexes', () => {
  it('rebuilds an old expireAfterSeconds: 0 index with the 7 day purge delay', async () => {
    await EmailToken.collection.dropIndex((await expiresAtIndex())!.name!);
    await EmailToken.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    expect((await expiresAtIndex())?.expireAfterSeconds).toBe(0);

    await syncEmailTokenIndexes();

    expect((await expiresAtIndex())?.expireAfterSeconds).toBe(EMAIL_TOKEN_PURGE_AFTER_SECONDS);
  });

  it('leaves an already current index alone', async () => {
    await syncEmailTokenIndexes();
    expect((await expiresAtIndex())?.expireAfterSeconds).toBe(EMAIL_TOKEN_PURGE_AFTER_SECONDS);
  });
});
