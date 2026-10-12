import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { env } from '../config/env.js';
import { RATE_LIMITS, createLimiter } from './rateLimit.js';

describe('createLimiter', () => {
  beforeAll(() => {
    env.FORCE_RATE_LIMIT = true; // limiters are skipped under NODE_ENV=test otherwise
  });
  afterAll(() => {
    env.FORCE_RATE_LIMIT = false;
  });

  it('answers 429 RATE_LIMITED once the limit is exceeded', async () => {
    const app = express();
    app.post('/limited', createLimiter(2), (_req, res) => {
      res.json({ ok: true });
    });

    expect((await request(app).post('/limited')).status).toBe(200);
    expect((await request(app).post('/limited')).status).toBe(200);

    const blocked = await request(app).post('/limited');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  });

  it('uses the agreed per-route limits', () => {
    expect(RATE_LIMITS).toMatchObject({ login: 10, register: 10, resetPassword: 10 });
  });
});
