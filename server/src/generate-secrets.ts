import { randomToken } from './utils/crypto.js';

// Prints fresh values for every secret in server/.env (npm run generate-secrets).
// 32 bytes -> 64 hex chars, comfortably above the 32-char minimum enforced in config/env.ts.
const SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TELEGRAM_WEBHOOK_SECRET'] as const;

for (const name of SECRETS) {
  console.log(`${name}=${randomToken()}`);
}
