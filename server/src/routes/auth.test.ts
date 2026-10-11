import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { env } from '../config/env.js';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.js';
import {
  sendPasswordResetEmail,
  sendUserAwaitingApprovalEmail,
  sendVerificationEmail,
} from '../services/email.js';
import { RateLimitHit } from '../models/RateLimitHit.js';
import { sha256 } from '../utils/crypto.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendVerificationEmail: vi.fn(async () => ({})),
  sendPasswordResetEmail: vi.fn(async () => ({})),
  sendUserAwaitingApprovalEmail: vi.fn(async () => ({})),
}));

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';

const makeUser = async (overrides: Record<string, unknown> = {}) =>
  User.create({
    name: 'Test User',
    email: 'test@inventory.local',
    passwordHash: await hashPassword(PASSWORD),
    ...overrides,
  });

const login = (email = 'test@inventory.local', password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password });

/** The raw token that the mocked mailer was last asked to send. */
const lastToken = (mock: typeof sendVerificationEmail) => {
  const calls = vi.mocked(mock).mock.calls;
  return calls[calls.length - 1][2];
};

/**
 * POST /forgot-password answers 204 first and does the work afterwards, so for a known email wait
 * until the mailer has actually been called before the test looks at the result.
 */
const requestReset = async (email: string) => {
  const before = vi.mocked(sendPasswordResetEmail).mock.calls.length;
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  if (res.status === 204 && (await User.exists({ email }))) {
    await vi.waitFor(() => expect(vi.mocked(sendPasswordResetEmail).mock.calls.length).toBe(before + 1));
  }
  return res;
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

describe('POST /api/auth/register', () => {
  it('creates a pending, unverified staff user and emails a hashed single-use token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New Person', email: 'New@Inventory.local', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']).toBeUndefined(); // no session on register

    const user = await User.findOne({ email: 'new@inventory.local' });
    expect(user).toMatchObject({ status: 'pending', role: 'staff', emailVerified: false });
    expect(user!.passwordHash).not.toBe(PASSWORD);

    const raw = lastToken(sendVerificationEmail);
    const stored = await EmailToken.findOne({ user: user!._id });
    expect(stored).toMatchObject({ type: 'verify-email', consumed: false, tokenHash: sha256(raw) });
    expect(stored!.tokenHash).not.toBe(raw);
    expect(stored!.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);
  });

  it('rejects an existing email with an explicit DUPLICATE_EMAIL error', async () => {
    await makeUser();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'test@inventory.local', password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'DUPLICATE_EMAIL', message: 'This email is already registered.' });
    expect(await User.countDocuments()).toBe(1);
  });

  it('validates the body', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('leaves no account behind when the email cannot be sent', async () => {
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(
      Object.assign(new Error('down'), { statusCode: 503, code: 'EMAIL_UNAVAILABLE' })
    );
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New', email: 'new@inventory.local', password: PASSWORD });

    expect(res.status).toBe(500); // plain Error here; the real service throws AppError 503
    expect(await User.countDocuments()).toBe(0);
    expect(await EmailToken.countDocuments()).toBe(0);
  });

  describe('production without SMTP', () => {
    const original = env.NODE_ENV;
    beforeAll(() => {
      env.NODE_ENV = 'production';
    });
    afterAll(() => {
      env.NODE_ENV = original;
    });

    it('answers 503 EMAIL_UNAVAILABLE before touching the DB', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'New', email: 'new@inventory.local', password: PASSWORD });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('EMAIL_UNAVAILABLE');
      expect(await User.countDocuments()).toBe(0);
    });

    it('gives forgot-password the same 503 for known and unknown emails', async () => {
      await makeUser();
      const known = await requestReset('test@inventory.local');
      const unknown = await requestReset('nobody@inventory.local');
      expect(known.status).toBe(503);
      expect(unknown.status).toBe(503);
      expect(known.body).toEqual(unknown.body);
    });
  });
});

describe('GET /api/auth/verify-email/:token', () => {
  const registerAndGetToken = async () => {
    await request(app).post('/api/auth/register').send({ name: 'New', email: 'new@inventory.local', password: PASSWORD });
    return lastToken(sendVerificationEmail);
  };

  it('verifies the email once, then treats the link as invalid', async () => {
    const token = await registerAndGetToken();

    const first = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ verified: true, type: 'verify-email' }); // never the user
    expect((await User.findOne({ email: 'new@inventory.local' }))!.emailVerified).toBe(true);

    const second = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TOKEN');
  });

  it('tells an expired link (TOKEN_EXPIRED) apart from an unknown one (INVALID_TOKEN)', async () => {
    const token = await registerAndGetToken();
    await EmailToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const expired = await request(app).get(`/api/auth/verify-email/${token}`);
    const unknown = await request(app).get('/api/auth/verify-email/does-not-exist');
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_TOKEN');
    expect((await User.findOne({ email: 'new@inventory.local' }))!.emailVerified).toBe(false);
  });

  it('keeps expired tokens for a week before Mongo may purge them', async () => {
    const indexes = await EmailToken.collection.indexes();
    const ttl = indexes.find((index) => index.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(7 * 24 * 60 * 60);
  });

  it('notifies every active admin once when a pending user becomes approvable', async () => {
    await makeUser({ email: 'admin@inventory.local', name: 'Boss', role: 'admin', status: 'active', emailVerified: true });
    await makeUser({ email: 'gone@inventory.local', name: 'Gone', role: 'admin', status: 'rejected', emailVerified: true });
    const token = await registerAndGetToken();

    await request(app).get(`/api/auth/verify-email/${token}`);
    await vi.waitFor(() => expect(sendUserAwaitingApprovalEmail).toHaveBeenCalledTimes(1));
    expect(sendUserAwaitingApprovalEmail).toHaveBeenCalledWith(
      'admin@inventory.local',
      'Boss',
      'New',
      'new@inventory.local',
      `${env.CLIENT_URL}/users`
    );
  });

  it('does not accept (or burn) a reset-password token', async () => {
    const user = await makeUser();
    await requestReset(user.email);
    const resetToken = lastToken(sendPasswordResetEmail);

    const res = await request(app).get(`/api/auth/verify-email/${resetToken}`);
    expect(res.status).toBe(400);
    expect((await EmailToken.findOne({ tokenHash: sha256(resetToken) }))!.consumed).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  it('logs an active user in with httpOnly cookies and returns the AuthUser', async () => {
    await makeUser({ status: 'active', emailVerified: true });
    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'test@inventory.local', status: 'active', role: 'staff' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookies: string[] = res.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('access_token='))!;
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/Secure/);
    expect(access).toMatch(/SameSite=Strict/);
    expect(refresh).toMatch(/Path=\/api\/auth/);
  });

  it('still issues a session to pending users, verified or not', async () => {
    await makeUser({ status: 'pending', emailVerified: false });
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ status: 'pending', emailVerified: false });
    expect(cookieHeader(res.headers['set-cookie'])).toHaveLength(2);
  });

  it('blocks rejected users with ACCOUNT_REJECTED and no cookies', async () => {
    await makeUser({ status: 'rejected' });
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_REJECTED');
    expect(cookieHeader(res.headers['set-cookie'])).toHaveLength(0);
  });

  it('does not reveal a rejected status to someone with the wrong password', async () => {
    await makeUser({ status: 'rejected' });
    const res = await login('test@inventory.local', 'WrongPassword1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the same 401 for a wrong password, unknown email and a passwordless account', async () => {
    await makeUser();
    await makeUser({ email: 'telegram@inventory.local', passwordHash: undefined });

    const wrong = await login('test@inventory.local', 'WrongPassword1');
    const unknown = await login('nobody@inventory.local');
    const passwordless = await login('telegram@inventory.local');

    for (const res of [wrong, unknown, passwordless]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }
  });
});

describe('sessions: /me, /refresh, /logout', () => {
  const loginCookies = async () => cookieHeader((await login()).headers['set-cookie']);

  beforeEach(async () => {
    await makeUser({ status: 'active', emailVerified: true });
  });

  it('GET /me requires a session and returns the AuthUser', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    const res = await request(app).get('/api/auth/me').set('Cookie', await loginCookies());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Test User',
      email: 'test@inventory.local',
      role: 'staff',
      status: 'active',
      emailVerified: true,
    });
  });

  it('GET /me reflects a status change immediately (requireAuth re-reads the user)', async () => {
    const cookies = await loginCookies();
    await User.updateOne({ email: 'test@inventory.local' }, { status: 'rejected' });
    const res = await request(app).get('/api/auth/me').set('Cookie', cookies);
    expect(res.body.status).toBe('rejected');
  });

  it('POST /refresh rotates the refresh token and sets new cookies', async () => {
    const cookies = await loginCookies();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@inventory.local');
    const next = cookieHeader(res.headers['set-cookie']);
    expect(next).toHaveLength(2);
    expect(next.find((c) => c.startsWith('refresh_token='))).not.toBe(
      cookies.find((c) => c.startsWith('refresh_token='))
    );
    expect(await RefreshToken.countDocuments({ revoked: true })).toBe(1);
  });

  it('POST /refresh treats a reused (already rotated) token as theft and revokes every session', async () => {
    const cookies = await loginCookies();
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(rotated.status).toBe(200);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(replay.status).toBe(401);

    // The legitimately rotated token is dead too
    const again = await request(app).post('/api/auth/refresh').set('Cookie', cookieHeader(rotated.headers['set-cookie']));
    expect(again.status).toBe(401);
    expect(await RefreshToken.countDocuments({ revoked: false })).toBe(0);
  });

  it('POST /refresh without a cookie is 401', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
  });

  it('POST /logout revokes the refresh token and clears both cookies, even without an access cookie', async () => {
    const cookies = await loginCookies();
    const refreshOnly = cookies.filter((c) => c.startsWith('refresh_token='));

    const res = await request(app).post('/api/auth/logout').set('Cookie', refreshOnly);
    expect(res.status).toBe(204);
    const cleared = ([res.headers['set-cookie']].flat() as string[]).map((c) => c.split('=')[0]);
    expect(cleared).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', refreshOnly);
    expect(refresh.status).toBe(401);
  });

  it('POST /logout is a quiet 204 when already logged out', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('requires a session', async () => {
    expect((await request(app).post('/api/auth/resend-verification')).status).toBe(401);
  });

  it('sends a fresh link to an unverified user and invalidates the old one', async () => {
    await request(app).post('/api/auth/register').send({ name: 'New', email: 'new@inventory.local', password: PASSWORD });
    const oldToken = lastToken(sendVerificationEmail);
    const cookies = cookieHeader((await login('new@inventory.local')).headers['set-cookie']);

    const res = await request(app).post('/api/auth/resend-verification').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    const newToken = lastToken(sendVerificationEmail);
    expect(newToken).not.toBe(oldToken);

    expect((await request(app).get(`/api/auth/verify-email/${oldToken}`)).status).toBe(400);
    expect((await request(app).get(`/api/auth/verify-email/${newToken}`)).status).toBe(200);
  });

  it('is a no-op for an already verified user', async () => {
    await makeUser({ emailVerified: true });
    const cookies = cookieHeader((await login()).headers['set-cookie']);
    const res = await request(app).post('/api/auth/resend-verification').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('forgot-password answers identically for known and unknown emails, mailing only the known one', async () => {
    await makeUser();
    const known = await requestReset('test@inventory.local');
    const unknown = await requestReset('nobody@inventory.local');

    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
    expect(known.text).toBe('');
    expect(unknown.text).toBe('');
    expect(known.body).toEqual(unknown.body);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect((await EmailToken.findOne({ type: 'reset-password' }))!.expiresAt.getTime() - Date.now()).toBeLessThan(
      3_600_000
    );
  });

  it('resets the password, ends every session and consumes the token', async () => {
    await makeUser({ status: 'active', emailVerified: true });
    const cookies = cookieHeader((await login()).headers['set-cookie']);

    await requestReset('test@inventory.local');
    const token = lastToken(sendPasswordResetEmail);

    const res = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'N3w!Passw0rd!!' });
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined(); // no session after a reset

    expect((await login()).status).toBe(401); // old password
    expect((await login('test@inventory.local', 'N3w!Passw0rd!!')).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookies)).status).toBe(401);

    const reuse = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'An0ther!Passw0rd' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('validates the new password and keeps the token usable after a validation failure', async () => {
    await makeUser();
    await requestReset('test@inventory.local');
    const token = lastToken(sendPasswordResetEmail);

    const weak = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const ok = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'N3w!Passw0rd!!' });
    expect(ok.status).toBe(204);
  });

  it('only the newest reset link works', async () => {
    await makeUser();
    await requestReset('test@inventory.local');
    const first = lastToken(sendPasswordResetEmail);
    await requestReset('test@inventory.local');
    const second = lastToken(sendPasswordResetEmail);

    expect((await request(app).post(`/api/auth/reset-password/${first}`).send({ password: 'N3w!Passw0rd!!' })).status).toBe(400);
    expect((await request(app).post(`/api/auth/reset-password/${second}`).send({ password: 'N3w!Passw0rd!!' })).status).toBe(204);
  });

  it('answers an expired reset link with TOKEN_EXPIRED', async () => {
    await makeUser();
    await requestReset('test@inventory.local');
    const token = lastToken(sendPasswordResetEmail);
    await EmailToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'N3w!Passw0rd!!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('lets a Telegram-only account (no password) set one through a reset', async () => {
    await makeUser({ passwordHash: undefined, telegramChatId: '555', status: 'active', emailVerified: true });
    await requestReset('test@inventory.local');
    const token = lastToken(sendPasswordResetEmail);

    const res = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'N3w!Passw0rd!!' });
    expect(res.status).toBe(204);
    expect((await login('test@inventory.local', 'N3w!Passw0rd!!')).status).toBe(200);
  });

  it('records a failed send on the user and clears it after the next successful one', async () => {
    const user = await makeUser();
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(new Error('smtp down'));
    const failing = request(app).post('/api/auth/forgot-password').send({ email: user.email });
    expect((await failing).status).toBe(204);
    await vi.waitFor(async () => {
      const failed = await User.findById(user._id);
      expect(failed!.lastEmailFailedAt).toBeInstanceOf(Date);
      expect(failed!.lastEmailFailedType).toBe('reset-password');
    });

    await requestReset(user.email);
    await vi.waitFor(async () => {
      const ok = await User.findById(user._id);
      expect(ok!.lastEmailFailedAt).toBeUndefined();
      expect(ok!.lastEmailFailedType).toBeUndefined();
    });
  });
});

describe('PATCH /api/auth/email', () => {
  const sessionFor = async (overrides: Record<string, unknown> = {}) => {
    await makeUser(overrides);
    return cookieHeader((await login()).headers['set-cookie']);
  };

  it('requires a session', async () => {
    expect((await request(app).patch('/api/auth/email').send({ email: 'a@inventory.local' })).status).toBe(401);
  });

  it('changes the address, stays unverified and replaces the verification link', async () => {
    const cookies = await sessionFor();
    await request(app).post('/api/auth/resend-verification').set('Cookie', cookies);
    const oldToken = lastToken(sendVerificationEmail);

    const res = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: ' Fixed@Inventory.local ' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'fixed@inventory.local', emailVerified: false });
    expect(vi.mocked(sendVerificationEmail).mock.calls.at(-1)![0]).toBe('fixed@inventory.local');

    const newToken = lastToken(sendVerificationEmail);
    expect((await request(app).get(`/api/auth/verify-email/${oldToken}`)).status).toBe(400);
    expect((await request(app).get(`/api/auth/verify-email/${newToken}`)).status).toBe(200);
    expect((await User.findOne({ email: 'fixed@inventory.local' }))!.emailVerified).toBe(true);
  });

  it('answers 409 DUPLICATE_EMAIL when the address belongs to another account', async () => {
    await makeUser({ email: 'taken@inventory.local' });
    await User.create({ name: 'Me', email: 'me@inventory.local', passwordHash: await hashPassword(PASSWORD) });
    const cookies = cookieHeader((await login('me@inventory.local')).headers['set-cookie']);

    const res = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'taken@inventory.local' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
  });

  it('answers 403 FORBIDDEN once the email is verified', async () => {
    const cookies = await sessionFor({ emailVerified: true });
    const res = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'other@inventory.local' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await User.exists({ email: 'other@inventory.local' })).toBeNull();
  });

  it('validates the email', async () => {
    const cookies = await sessionFor();
    const res = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('devMailUrl', () => {
  it('is returned by register, resend and change-email when the mailer only logged the link', async () => {
    const link = 'http://localhost:5173/verify-email/abc';
    vi.mocked(sendVerificationEmail).mockResolvedValue({ devMailUrl: link });

    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New', email: 'new@inventory.local', password: PASSWORD });
    expect(reg.body.devMailUrl).toBe(link);

    const cookies = cookieHeader((await login('new@inventory.local')).headers['set-cookie']);
    const resend = await request(app).post('/api/auth/resend-verification').set('Cookie', cookies);
    expect(resend.body).toEqual({ devMailUrl: link });
    const change = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'n2@inventory.local' });
    expect(change.body.devMailUrl).toBe(link);

    vi.mocked(sendVerificationEmail).mockResolvedValue({});
  });

  it('is never part of the forgot-password response', async () => {
    await makeUser();
    const res = await requestReset('test@inventory.local');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

describe('Mongo rate limits (forced on)', () => {
  beforeAll(() => {
    process.env.FORCE_RATE_LIMIT = '1';
  });
  afterAll(() => {
    delete process.env.FORCE_RATE_LIMIT;
  });

  it.each(['test@inventory.local', 'nobody@inventory.local'])(
    'limits forgot-password to 3 per hour for %s (same answer for real and unknown emails)',
    async (email) => {
      await makeUser();
      for (let i = 0; i < 3; i++) {
        expect((await request(app).post('/api/auth/forgot-password').send({ email })).status).toBe(204);
      }

      const res = await request(app).post('/api/auth/forgot-password').send({ email });
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.body.error.details.retryAfter).toBeGreaterThan(0);
      expect(Number(res.headers['retry-after'])).toBe(res.body.error.details.retryAfter);
      expect(res.body.error.message).toBe('Too many requests. Please try again later.');
    }
  );

  it('limits forgot-password to 5 per IP per hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        (await request(app).post('/api/auth/forgot-password').send({ email: `u${i}@inventory.local` })).status
      ).toBe(204);
    }
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'u9@inventory.local' });
    expect(res.status).toBe(429);
  });

  it('shares 3 per user per hour between resend and change-email', async () => {
    await makeUser();
    const cookies = cookieHeader((await login()).headers['set-cookie']);
    expect((await request(app).post('/api/auth/resend-verification').set('Cookie', cookies)).status).toBe(200);
    expect((await request(app).post('/api/auth/resend-verification').set('Cookie', cookies)).status).toBe(200);
    expect(
      (await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'x@inventory.local' })).status
    ).toBe(200);

    const res = await request(app).post('/api/auth/resend-verification').set('Cookie', cookies);
    expect(res.status).toBe(429);
    expect(res.body.error.details.retryAfter).toBeGreaterThan(0);
  });

  it('keeps the counters in Mongo, so they are shared between instances', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'a@inventory.local' });
    expect(await RateLimitHit.countDocuments({ _id: /^forgot:ip:/ })).toBe(1);
  });
});
