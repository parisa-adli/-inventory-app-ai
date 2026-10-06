import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword } from './password.js';
import { durationToMs, signAccessToken, verifyAccessToken } from './jwt.js';
import { sha256, randomToken } from '../utils/crypto.js';
import { UnauthorizedError } from '../utils/errors.js';

describe('password service', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('Admin@123');
    expect(hash).not.toBe('Admin@123');
    expect(await verifyPassword('Admin@123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips the user id', () => {
    expect(verifyAccessToken(signAccessToken('user-1'))).toBe('user-1');
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({}, 'x'.repeat(40), { subject: 'user-1' });
    expect(() => verifyAccessToken(forged)).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({}, process.env.JWT_ACCESS_SECRET!, { subject: 'user-1', expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow(UnauthorizedError);
  });

  it('rejects garbage', () => {
    expect(() => verifyAccessToken('not-a-token')).toThrow(UnauthorizedError);
  });
});

describe('durationToMs', () => {
  it('parses supported units', () => {
    expect(durationToMs('15m')).toBe(15 * 60_000);
    expect(durationToMs('7d')).toBe(7 * 86_400_000);
  });

  it('throws on invalid input', () => {
    expect(() => durationToMs('soon')).toThrow();
  });
});

describe('crypto utils', () => {
  it('sha256 is deterministic and randomToken is unique', () => {
    expect(sha256('a')).toBe(sha256('a'));
    expect(randomToken()).not.toBe(randomToken());
  });
});
