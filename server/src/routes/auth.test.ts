import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { env } from '../config/env.js';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.js';
import { sha256 } from '../utils/crypto.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendVerificationEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
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
      const known = await request(app).post('/api/auth/forgot-password').send({ email: 'test@inventory.local' });
      const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@inventory.local' });
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
    expect((await User.findOne({ email: 'new@inventory.local' }))!.emailVerified).toBe(true);

    const second = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects expired and unknown tokens with the same generic error', async () => {
    const token = await registerAndGetToken();
    await EmailToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const expired = await request(app).get(`/api/auth/verify-email/${token}`);
    const unknown = await request(app).get('/api/auth/verify-email/does-not-exist');
    expect(expired.status).toBe(400);
    expect(expired.body).toEqual(unknown.body);
    expect(expired.body.error.code).toBe('INVALID_TOKEN');
  });

  it('does not accept (or burn) a reset-password token', async () => {
    const user = await makeUser();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
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
    expect(res.status).toBe(204);
    const newToken = lastToken(sendVerificationEmail);
    expect(newToken).not.toBe(oldToken);

    expect((await request(app).get(`/api/auth/verify-email/${oldToken}`)).status).toBe(400);
    expect((await request(app).get(`/api/auth/verify-email/${newToken}`)).status).toBe(200);
  });

  it('is a no-op for an already verified user', async () => {
    await makeUser({ emailVerified: true });
    const cookies = cookieHeader((await login()).headers['set-cookie']);
    const res = await request(app).post('/api/auth/resend-verification').set('Cookie', cookies);
    expect(res.status).toBe(204);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('forgot-password answers identically for known and unknown emails, mailing only the known one', async () => {
    await makeUser();
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'test@inventory.local' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@inventory.local' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect((await EmailToken.findOne({ type: 'reset-password' }))!.expiresAt.getTime() - Date.now()).toBeLessThan(
      3_600_000
    );
  });

  it('resets the password, ends every session and consumes the token', async () => {
    await makeUser({ status: 'active', emailVerified: true });
    const cookies = cookieHeader((await login()).headers['set-cookie']);

    await request(app).post('/api/auth/forgot-password').send({ email: 'test@inventory.local' });
    const token = lastToken(sendPasswordResetEmail);

    const res = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'N3w!Passw0rd!!' });
    expect(res.status).toBe(200);

    expect((await login()).status).toBe(401); // old password
    expect((await login('test@inventory.local', 'N3w!Passw0rd!!')).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookies)).status).toBe(401);

    const reuse = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'An0ther!Passw0rd' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('validates the new password and keeps the token usable after a validation failure', async () => {
    await makeUser();
    await request(app).post('/api/auth/forgot-password').send({ email: 'test@inventory.local' });
    const token = lastToken(sendPasswordResetEmail);

    const weak = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const ok = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'N3w!Passw0rd!!' });
    expect(ok.status).toBe(200);
  });

  it('only the newest reset link works', async () => {
    await makeUser();
    await request(app).post('/api/auth/forgot-password').send({ email: 'test@inventory.local' });
    const first = lastToken(sendPasswordResetEmail);
    await request(app).post('/api/auth/forgot-password').send({ email: 'test@inventory.local' });
    const second = lastToken(sendPasswordResetEmail);

    expect((await request(app).post(`/api/auth/reset-password/${first}`).send({ password: 'N3w!Passw0rd!!' })).status).toBe(400);
    expect((await request(app).post(`/api/auth/reset-password/${second}`).send({ password: 'N3w!Passw0rd!!' })).status).toBe(200);
  });
});
