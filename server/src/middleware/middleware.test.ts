import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireActive } from './requireActive.js';
import { requirePasswordChanged } from './requirePasswordChanged.js';
import { requirePermission } from './requirePermission.js';
import { requireVerified } from './requireVerified.js';
import { validate } from './validate.js';

type SessionUser = NonNullable<Request['user']>;

const run = (mw: (req: Request, res: Response, next: (e?: unknown) => void) => void, req: Partial<Request>) => {
  const next = vi.fn();
  mw(req as Request, {} as Response, next);
  return next;
};

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: '1',
  role: 'staff',
  status: 'active',
  emailVerified: true,
  mustChangePassword: false,
  ...overrides,
});

describe('requirePermission', () => {
  it('passes when the role grants the permission', () => {
    const next = run(requirePermission('users.manage'), { user: user({ role: 'admin' }) });
    expect(next).toHaveBeenCalledWith();
  });

  it('403s FORBIDDEN when the role lacks it', () => {
    const next = run(requirePermission('users.manage'), { user: user() });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('needs every permission listed', () => {
    const next = run(requirePermission('stock.adjust', 'products.delete'), { user: user() });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it('401s when unauthenticated', () => {
    const next = run(requirePermission('inventory.view'), {});
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});

describe('requireVerified', () => {
  it('passes verified users', () => {
    expect(run(requireVerified, { user: user() })).toHaveBeenCalledWith();
  });

  it('403s EMAIL_UNVERIFIED', () => {
    const next = run(requireVerified, { user: user({ emailVerified: false }) });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: 'EMAIL_UNVERIFIED' });
  });
});

describe('requireActive', () => {
  it('passes active users', () => {
    expect(run(requireActive, { user: user() })).toHaveBeenCalledWith();
  });

  it.each([
    ['pending', 'ACCOUNT_PENDING'],
    ['rejected', 'ACCOUNT_REJECTED'],
  ] as const)('403s %s users with %s', (status, code) => {
    const next = run(requireActive, { user: user({ status }) });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code });
  });
});

describe('requirePasswordChanged', () => {
  it('passes users without a temporary password', () => {
    expect(run(requirePasswordChanged, { user: user() })).toHaveBeenCalledWith();
  });

  it('403s PASSWORD_CHANGE_REQUIRED', () => {
    const next = run(requirePasswordChanged, { user: user({ mustChangePassword: true }) });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
  });
});

describe('validate', () => {
  const mw = validate(z.object({ n: z.coerce.number() }));

  it('replaces body with parsed data', () => {
    const req = { body: { n: '5' } } as Request;
    const next = vi.fn();
    mw(req, {} as Response, next);
    expect(req.body).toEqual({ n: 5 });
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards a ZodError on invalid body', () => {
    const next = run(mw, { body: { n: 'abc' } });
    expect(next.mock.calls[0][0]).toBeInstanceOf(z.ZodError);
  });
});
