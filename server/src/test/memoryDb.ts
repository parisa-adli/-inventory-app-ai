import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * A throwaway in-memory mongod per test file, for the stock, product and seed test files only; every other DB test
 * stays on the local *_test database (./db.ts). The binary is cached in the root node_modules/.cache/mongodb-memory-server
 * (MONGOMS_DOWNLOAD_DIR in vitest.config.ts). npm's allowScripts skipped the package's postinstall download,
 * so the first run downloads it (a ~780 MB archive; about 3 minutes on this machine).
 * Never falls back to the local database: if mongod cannot start, the tests fail.
 */
let server: MongoMemoryServer | undefined;

/** First start can include the binary download; pass this as the timeout of the beforeAll that connects. */
export const MEMORY_DB_START_TIMEOUT_MS = 600_000;

export const connectMemoryDb = async (): Promise<void> => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri('inventory_memory_test'));
  // Build unique indexes before the first test relies on them
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
};

export const clearMemoryDb = async (): Promise<void> => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};

export const disconnectMemoryDb = async (): Promise<void> => {
  await mongoose.disconnect();
  await server?.stop();
  server = undefined;
};
