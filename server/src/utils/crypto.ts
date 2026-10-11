import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** URL-safe random token (raw value is sent to the user; only its sha256 is stored). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('hex');

/** Uniformly random numeric code of `digits` digits, zero padded (crypto.randomInt, never Math.random). */
export const randomOtp = (digits = 6): string =>
  String(randomInt(0, 10 ** digits)).padStart(digits, '0');

/** Keyed hash for low-entropy secrets (a 6 digit OTP is brute-forceable under a plain sha256). */
export const hmacSha256 = (value: string, secret: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');

/** Constant-time string comparison (false for different lengths without leaking where they differ). */
export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
