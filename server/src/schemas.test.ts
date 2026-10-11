import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  registerFormSchema,
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

  it('requires a letter, a digit and at most 72 bytes in new passwords', () => {
    const base = { name: 'a', email: 'a@b.co' };
    expect(registerSchema.safeParse({ ...base, password: 'abcdefghijkl' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: '1234567890123' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'abcdefghi1' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: `${'a'.repeat(71)}1` }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: `${'a'.repeat(72)}1` }).success).toBe(false);
    // multi-byte characters count as bytes: 1 + 37 x 2 + 1 = 76 bytes (but only 39 characters)
    expect(registerSchema.safeParse({ ...base, password: `a${'é'.repeat(37)}1` }).success).toBe(false);
  });

  it('does not apply the new-password rule to login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'Admin@123' }).success).toBe(true);
  });

  it('requires a non-empty login password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('requires the sign-up confirm password to match', () => {
    const base = { name: 'Jane', email: 'jane@example.com', password: 'longenough1' };
    expect(registerFormSchema.safeParse({ ...base, confirmPassword: 'longenough1' }).success).toBe(true);

    const mismatch = registerFormSchema.safeParse({ ...base, confirmPassword: 'different11' });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]).toMatchObject({ path: ['confirmPassword'], message: 'Passwords do not match' });
  });

  it('errors are instances of the same ZodError the server error handler checks', () => {
    const result = loginSchema.safeParse({});
    expect(result.error).toBeInstanceOf(z.ZodError);
  });
});
