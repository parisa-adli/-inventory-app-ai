import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import {
  assertEmailAvailable,
  emailMode,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verificationLink,
} from './email.js';

const snapshot = { ...env };

beforeEach(() => {
  env.BREVO_SMTP_USER = undefined;
  env.BREVO_SMTP_PASS = undefined;
});

afterEach(() => {
  Object.assign(env, snapshot);
  vi.restoreAllMocks();
});

describe('emailMode', () => {
  it('logs links in development and test when SMTP is not configured', () => {
    env.NODE_ENV = 'development';
    expect(emailMode()).toBe('log');
    env.NODE_ENV = 'test';
    expect(emailMode()).toBe('log');
  });

  it('treats placeholder credentials as not configured', () => {
    env.BREVO_SMTP_USER = 'your-brevo-smtp-user';
    env.BREVO_SMTP_PASS = 'your-brevo-smtp-password';
    expect(emailMode()).toBe('log');
  });

  it('uses SMTP once real credentials are set', () => {
    env.BREVO_SMTP_USER = 'real-user@smtp-brevo.com';
    env.BREVO_SMTP_PASS = 'xsmtpsib-real';
    expect(emailMode()).toBe('smtp');
  });

  it('is unavailable in production without SMTP', () => {
    env.NODE_ENV = 'production';
    expect(emailMode()).toBe('unavailable');
    expect(() => assertEmailAvailable()).toThrowError(expect.objectContaining({ statusCode: 503, code: 'EMAIL_UNAVAILABLE' }));
  });
});

describe('sending', () => {
  it('prints the client-origin link in development', async () => {
    env.NODE_ENV = 'development';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendVerificationEmail('a@inventory.local', 'Ann', 'tok123');

    expect(verificationLink('tok123')).toBe('http://localhost:5173/verify-email/tok123');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('http://localhost:5173/verify-email/tok123'));
  });

  it('never logs a token or link in production, and fails instead', async () => {
    env.NODE_ENV = 'production';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(sendPasswordResetEmail('a@inventory.local', 'Ann', 'secret-token')).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_UNAVAILABLE',
    });

    for (const spy of [log, info, error, warn]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-token');
    }
  });
});
