import mongoose from 'mongoose';
import { env } from '../config/env.js';

/** Test databases must be named *_test; this is the only guard between a test run and real data. */
export const assertTestDatabase = (uri: string): void => {
  const dbName = new URL(uri).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run DB tests against "${dbName}": database name must end in "_test"`);
  }
};

export const connectTestDb = async (): Promise<void> => {
  assertTestDatabase(env.MONGODB_URI);
  await mongoose.connect(env.MONGODB_URI);
  // Build unique indexes (e.g. User.email) before the first test relies on them
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
};

export const clearTestDb = async (): Promise<void> => {
  assertTestDatabase(env.MONGODB_URI);
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
};

export const disconnectTestDb = async (): Promise<void> => {
  assertTestDatabase(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

/** Turns a response's Set-Cookie headers into a Cookie request header (cookies are Secure, so no agent). */
export const cookieHeader = (setCookie: string[] | string | undefined): string[] =>
  [setCookie ?? []].flat().map((c) => c.split(';')[0]).filter((c) => !c.endsWith('='));
