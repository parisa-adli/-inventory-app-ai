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
