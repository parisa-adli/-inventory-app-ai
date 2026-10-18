import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createProductSchema,
  forgotPasswordSchema,
  loginSchema,
  productFormSchema,
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

describe('shared product schemas', () => {
  const CATEGORY = '0123456789abcdef01234567';
  const form = {
    title: ' Mouse ',
    sku: ' ele-001 ',
    category: CATEGORY,
    supplier: '',
    costPrice: '12.50',
    salePrice: '0',
    unitOfMeasure: 'pcs',
    imageUrl: '',
  };
  const messages = (result: { error?: z.ZodError }) => result.error?.issues.map((issue) => issue.message);

  it('turns form input into the values the API accepts', () => {
    const parsed = productFormSchema.parse(form);
    expect(parsed).toEqual({ ...form, title: 'Mouse', sku: 'ELE-001', costPrice: 12.5, salePrice: 0 });
    expect(createProductSchema.safeParse({ ...parsed, supplier: undefined, imageUrl: undefined }).success).toBe(true);
  });

  it.each([
    ['sku', 'ele 001', 'ele 001'],
    ['costPrice', '1.234', 1.234],
    ['salePrice', '-1', -1],
    ['imageUrl', 'ftp://x.test/a.png', 'ftp://x.test/a.png'],
  ])('reports the same %s error in the form and the API', (field, formValue, apiValue) => {
    const api = { ...form, sku: 'ELE-001', costPrice: 1, salePrice: 1, supplier: undefined, imageUrl: undefined };
    const fromForm = messages(productFormSchema.safeParse({ ...form, [field]: formValue }));
    const fromApi = messages(createProductSchema.safeParse({ ...api, [field]: apiValue }));
    expect(fromForm).toHaveLength(1);
    expect(fromForm).toEqual(fromApi);
  });

  it.each(['1e2', '0x10', '12abc'])('reads only plain decimals as a price in the form (%s)', (typed) => {
    expect(messages(productFormSchema.safeParse({ ...form, costPrice: typed }))).toEqual(['Cost price must be a number']);
  });

  it('requires prices and a category in the form', () => {
    expect(messages(productFormSchema.safeParse({ ...form, costPrice: ' ', category: '' }))).toEqual([
      'Choose a category',
      'Cost price is required',
    ]);
  });
});
