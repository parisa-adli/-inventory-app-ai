import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authUserSchema } from '@inventory/shared';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { createEmailToken } from '../services/emailToken.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { hashPassword } from '../services/password.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../test/db.js';

// Profile self-service (CONTRACT-CHANGES C13): display name and sign-in methods.
// An account must always keep at least one sign-in method (a password or a Telegram link).

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';
const NEW_PASSWORD = 'Br4nd-new-password';

let counter = 0;
const ACTIVE = { role: 'staff', status: 'active', emailVerified: true } as const;
const withPassword = async (fields: object = {}) =>
  User.create({ name: 'Someone', email: `profile${++counter}@inventory.local`, passwordHash: await hashPassword(PASSWORD), ...ACTIVE, ...fields });
const telegramOnly = (fields: object = {}) =>
  User.create({ name: 'Tele', email: `tele${++counter}@inventory.local`, telegramChatId: String(1000 + counter), telegramUsername: 'tele_user', ...ACTIVE, ...fields });
const both = () => withPassword({ telegramChatId: String(5000 + ++counter), telegramUsername: 'both_user' });

const cookieFor = (id: unknown) => [`${ACCESS_COOKIE}=${signAccessToken(String(id))}`];
const as = (id: unknown) => ({
  get: (path: string) => request(app).get(path).set('Cookie', cookieFor(id)),
  post: (path: string, body: object = {}) => request(app).post(path).set('Cookie', cookieFor(id)).send(body),
  patch: (path: string, body: object = {}) => request(app).patch(path).set('Cookie', cookieFor(id)).send(body),
  delete: (path: string) => request(app).delete(path).set('Cookie', cookieFor(id)),
});
const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('AuthUser sign-in methods', () => {
  it('/me tells whether a password is set and which Telegram account is linked', async () => {
    const user = await both();
    const res = await as(user._id).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(authUserSchema.parse(res.body)).toMatchObject({ hasPassword: true, telegramLinked: true, telegramUsername: 'both_user' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(user.telegramChatId!);
  });

  it('a Telegram-only account reports no password; an unlinked one no Telegram', async () => {
    const tele = await telegramOnly();
    const pw = await withPassword({ telegramUsername: 'stale' });

    expect((await as(tele._id).get('/api/auth/me')).body).toMatchObject({ hasPassword: false, telegramLinked: true });
    expect((await as(pw._id).get('/api/auth/me')).body).toMatchObject({ hasPassword: true, telegramLinked: false, telegramUsername: null });
  });
});

describe('PATCH /api/auth/me', () => {
  it('renames the caller with the sign-up name rule', async () => {
    const user = await withPassword();

    const res = await as(user._id).patch('/api/auth/me', { name: '  New Name  ' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');
    expect((await User.findById(user._id))?.name).toBe('New Name');
  });

  it('rejects an empty name', async () => {
    const user = await withPassword();
    const res = await as(user._id).patch('/api/auth/me', { name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/password/set', () => {
  it('adds a password to a Telegram-only account, which can then sign in with it', async () => {
    const user = await telegramOnly();

    const res = await as(user._id).post('/api/auth/password/set', { newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.hasPassword).toBe(true);
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('keeps the other sessions', async () => {
    const user = await telegramOnly();
    await RefreshToken.create({ user: user._id, tokenHash: 'other-device', expiresAt: new Date(Date.now() + 60_000) });

    await as(user._id).post('/api/auth/password/set', { newPassword: NEW_PASSWORD }).expect(200);

    expect(await RefreshToken.countDocuments({ user: user._id, revoked: false })).toBe(1);
  });

  it('is 409 PASSWORD_ALREADY_SET when the account has a password (change it instead)', async () => {
    const user = await withPassword();

    const res = await as(user._id).post('/api/auth/password/set', { newPassword: NEW_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PASSWORD_ALREADY_SET');
    expect((await login(user.email, PASSWORD)).status).toBe(200);
  });

  it('applies the password rule', async () => {
    const user = await telegramOnly();
    const res = await as(user._id).post('/api/auth/password/set', { newPassword: 'short1' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/auth/password', () => {
  it('removes the password of an account that has Telegram linked', async () => {
    const user = await both();

    const res = await as(user._id).delete('/api/auth/password');

    expect(res.status).toBe(200);
    expect(res.body.user.hasPassword).toBe(false);
    expect((await login(user.email, PASSWORD)).status).toBe(401);
  });

  it('is 409 LAST_SIGN_IN_METHOD when the password is the only way in', async () => {
    const user = await withPassword();

    const res = await as(user._id).delete('/api/auth/password');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_SIGN_IN_METHOD');
    expect((await login(user.email, PASSWORD)).status).toBe(200);
  });
});

describe('DELETE /api/auth/telegram', () => {
  it('unlinks the caller’s Telegram account and drops a pending link-telegram email', async () => {
    const user = await both();
    await createEmailToken(user._id, 'link-telegram', '999');

    const res = await as(user._id).delete('/api/auth/telegram');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ telegramLinked: false, telegramUsername: null });
    const stored = await User.findById(user._id);
    expect(stored?.telegramChatId).toBeUndefined();
    expect(stored?.telegramUsername).toBeUndefined();
    expect(await EmailToken.countDocuments({ user: user._id, type: 'link-telegram' })).toBe(0);
  });

  it('is 409 LAST_SIGN_IN_METHOD when Telegram is the only way in', async () => {
    const user = await telegramOnly();

    const res = await as(user._id).delete('/api/auth/telegram');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_SIGN_IN_METHOD');
    expect((await User.findById(user._id))?.telegramChatId).toBeDefined();
  });
});

describe('the last sign-in method is never removed', () => {
  it('removing the password and unlinking Telegram at the same moment leaves one of them', async () => {
    for (let round = 0; round < 5; round++) {
      const user = await both();

      const results = await Promise.all([as(user._id).delete('/api/auth/password'), as(user._id).delete('/api/auth/telegram')]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const stored = await User.findById(user._id);
      expect(Boolean(stored?.passwordHash) || Boolean(stored?.telegramChatId)).toBe(true);
    }
  });

  it('an admin cannot unlink the Telegram account of a user without a password', async () => {
    const admin = await withPassword({ role: 'admin' });
    const target = await telegramOnly();

    const res = await as(admin._id).delete(`/api/users/${target._id}/credentials/telegram`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_SIGN_IN_METHOD');
    expect((await User.findById(target._id))?.telegramChatId).toBeDefined();
  });

  it('an admin unlink racing the user’s own password removal leaves one method', async () => {
    const admin = await withPassword({ role: 'admin' });
    for (let round = 0; round < 5; round++) {
      const user = await both();

      const results = await Promise.all([
        as(admin._id).delete(`/api/users/${user._id}/credentials/telegram`),
        as(user._id).delete('/api/auth/password'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const stored = await User.findById(user._id);
      expect(Boolean(stored?.passwordHash) || Boolean(stored?.telegramChatId)).toBe(true);
    }
  });

  it('an admin unlink of a missing user is still 404', async () => {
    const admin = await withPassword({ role: 'admin' });
    const res = await as(admin._id).delete('/api/users/507f1f77bcf86cd799439011/credentials/telegram');
    expect(res.status).toBe(404);
  });
});
