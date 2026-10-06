import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireActive } from './auth.js';
import { requireRole } from './roleGuard.js';
import { validate } from './validate.js';

const run = (mw: (req: Request, res: Response, next: (e?: unknown) => void) => void, req: Partial<Request>) => {
  const next = vi.fn();
  mw(req as Request, {} as Response, next);
  return next;
};

describe('requireRole', () => {
  it('passes a matching role', () => {
    const next = run(requireRole('admin'), { user: { id: '1', role: 'admin', status: 'active' } });
    expect(next).toHaveBeenCalledWith();
  });

  it('403s a non-matching role', () => {
    const next = run(requireRole('admin'), { user: { id: '1', role: 'staff', status: 'active' } });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it('401s when unauthenticated', () => {
    const next = run(requireRole('admin'), {});
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});

describe('requireActive', () => {
  it('passes active users', () => {
    const next = run(requireActive, { user: { id: '1', role: 'staff', status: 'active' } });
    expect(next).toHaveBeenCalledWith();
  });

  it.each(['pending', 'rejected'] as const)('403s %s users', (status) => {
    const next = run(requireActive, { user: { id: '1', role: 'staff', status } });
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
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
