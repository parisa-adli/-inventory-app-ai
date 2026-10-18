import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // DB-backed route tests share one test database, so files run one at a time
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      // Must end in _test: src/test/db.ts refuses to wipe any other database
      MONGODB_URI: 'mongodb://localhost:27017/inventory_app_claude_test',
      CLIENT_URL: 'http://localhost:5173',
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
      ACCESS_TOKEN_TTL: '15m',
      REFRESH_TOKEN_TTL: '7d',
      // A placeholder, so a real token in server/.env can never make tests talk to Telegram
      TELEGRAM_BOT_TOKEN: 'your-telegram-bot-token-for-tests',
      TELEGRAM_MODE: 'polling',
      // A made-up handle (matches the TELEGRAM_BOT_USERNAME format): the deep link of /telegram/start needs one
      TELEGRAM_BOT_USERNAME: 'inventory_test_bot',
      // mongodb-memory-server (src/test/memoryDb.ts): one mongod cache for the repo, wherever vitest is started from
      MONGOMS_DOWNLOAD_DIR: fileURLToPath(new URL('../node_modules/.cache/mongodb-memory-server', import.meta.url)),
    },
  },
});
