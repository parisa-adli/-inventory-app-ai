import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  otpVerifySchema,
  registerSchema,
  resetPasswordSchema,
} from '@inventory/shared';

describe('shared auth schemas (Zod 4)', () => {
  it('normalizes email (trim + lowercase) on register', () => {
    const result = registerSchema.parse({
      name: '  Jane ',
      email: '  Jane@Example.COM ',
      password: 'longenough1',
    });
    expect(result).toEqual({ name: 'Jane', email: 'jane@example.com', password: 'longenough1' });
  });

  it('rejects invalid email with the custom message', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'nope' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Enter a valid email address');
  });

  it('enforces password length', () => {
    expect(registerSchema.safeParse({ name: 'a', email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'short' }).success).toBe(false);
  });

  it('requires a non-empty login password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('requires a 6-digit OTP code', () => {
    expect(otpVerifySchema.safeParse({ email: 'a@b.co', code: '123456' }).success).toBe(true);
    expect(otpVerifySchema.safeParse({ email: 'a@b.co', code: '12345' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ email: 'a@b.co', code: 'abcdef' }).success).toBe(false);
  });

  it('errors are instances of the same ZodError the server error handler checks', () => {
    const result = loginSchema.safeParse({});
    expect(result.error).toBeInstanceOf(z.ZodError);
  });
});
