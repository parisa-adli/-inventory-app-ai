import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** URL-safe random token (raw value is sent to the user; only its sha256 is stored). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('hex');
