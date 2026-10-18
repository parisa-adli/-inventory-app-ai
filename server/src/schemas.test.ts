import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createProductSchema,
  createStockMovementSchema,
  forgotPasswordSchema,
  loginSchema,
  productFormSchema,
  registerFormSchema,
  registerSchema,
  resetPasswordSchema,
  stockMovementFormSchema,
  updateProductSchema,
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
    // The edit dialog sends every field, an emptied supplier or image URL as null
    expect(updateProductSchema.parse({ ...parsed, supplier: null, imageUrl: null })).toEqual({
      ...parsed,
      supplier: null,
      imageUrl: null,
    });
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

describe('shared stock movement form schema (the Adjust Stock dialog)', () => {
  const PRODUCT = '0123456789abcdef01234567';
  const form = { type: 'receive', quantity: ' 5 ', note: '  PO-17  ' };
  const messages = (result: { error?: z.ZodError }) => result.error?.issues.map((issue) => issue.message);

  it('turns typed text into the body the API accepts, once the product is added', () => {
    const parsed = stockMovementFormSchema.parse(form);
    expect(parsed).toEqual({ type: 'receive', quantity: 5, note: 'PO-17' });
    expect(createStockMovementSchema.parse({ productId: PRODUCT, ...parsed })).toEqual({ productId: PRODUCT, ...parsed });
  });

  it('reads a signed adjustment and leaves out a blank note', () => {
    expect(stockMovementFormSchema.parse({ ...form, type: 'adjustment', quantity: '-3', note: 'Damaged' }).quantity).toBe(-3);
    expect(stockMovementFormSchema.parse({ ...form, note: '   ' }).note).toBeUndefined();
  });

  it.each([
    ['a receive of 0', { quantity: '0' }, { quantity: 0 }],
    ['a negative ship', { type: 'ship', quantity: '-2' }, { type: 'ship', quantity: -2 }],
    ['a fractional amount', { quantity: '1.5' }, { quantity: 1.5 }],
    ['a zero adjustment', { type: 'adjustment', quantity: '0', note: 'Recount' }, { type: 'adjustment', quantity: 0, note: 'Recount' }],
    ['an adjustment without a reason', { type: 'adjustment', quantity: '2', note: ' ' }, { type: 'adjustment', quantity: 2, note: ' ' }],
  ])('reports the same error as the API for %s', (_case, formOverride, apiOverride) => {
    const fromForm = messages(stockMovementFormSchema.safeParse({ ...form, ...formOverride }));
    const fromApi = messages(createStockMovementSchema.safeParse({ productId: PRODUCT, ...form, ...apiOverride }));
    expect(fromForm).toHaveLength(1);
    expect(fromForm).toEqual(fromApi);
  });

  it.each(['abc', '1e2', '5 boxes', '--1'])('reads only plain numbers as an amount (%s)', (typed) => {
    expect(messages(stockMovementFormSchema.safeParse({ ...form, quantity: typed }))).toEqual(['Quantity must be a number']);
  });

  it('requires an amount', () => {
    expect(messages(stockMovementFormSchema.safeParse({ ...form, quantity: '  ' }))).toEqual(['Quantity is required']);
  });
});
