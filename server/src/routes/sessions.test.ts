import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sessionsResponseSchema } from '@inventory/shared';
import { createApp } from '../app.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { describeUserAgent } from '../services/deviceSessions.js';
import { hashPassword } from '../services/password.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

// Sessions (CONTEXT.md): one browser from sign in to sign out = one refresh-token family.
// GET /api/auth/sessions lists them; DELETE /api/auth/sessions is "Sign out everywhere" (CONTRACT-CHANGES C13).

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';
const EMAIL = 'sessions@inventory.local';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0';

const makeUser = async (fields: object = {}) =>
  User.create({
    name: 'Session User',
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    role: 'staff',
    status: 'active',
    emailVerified: true,
    ...fields,
  });

/** Signs in from a "browser" and returns its cookies. */
const signIn = async (userAgent = CHROME_WINDOWS) => {
  const res = await request(app).post('/api/auth/login').set('User-Agent', userAgent).send({ email: EMAIL, password: PASSWORD });
  expect(res.status).toBe(200);
  return cookieHeader(res.headers['set-cookie']);
};
const refresh = async (cookies: string[]) => {
  const res = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
  expect(res.status).toBe(200);
  return cookieHeader(res.headers['set-cookie']);
};
const listSessions = (cookies: string[]) => request(app).get('/api/auth/sessions').set('Cookie', cookies);
const me = (cookies: string[]) => request(app).get('/api/auth/me').set('Cookie', cookies);

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('device sessions', () => {
  it('a refresh keeps the session: same family, same sign-in time, newer activity', async () => {
    await makeUser();
    const cookies = await signIn();
    const first = (await RefreshToken.findOne())!;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await refresh(cookies);

    const live = (await RefreshToken.findOne({ revoked: false }))!;
    expect(live.familyId).toBe(first.familyId);
    expect(live.familyCreatedAt).toEqual(first.familyCreatedAt);
    expect(live.lastUsedAt!.getTime()).toBeGreaterThan(first.lastUsedAt!.getTime());
    expect(live.userAgent).toBe(CHROME_WINDOWS);
  });

  it('lists one row per browser, the asking one first and marked current', async () => {
    await makeUser();
    const firefox = await signIn(FIREFOX_MAC);
    const chrome = await refresh(await signIn(CHROME_WINDOWS)); // refreshed: still one session

    const res = await listSessions(firefox);

    expect(res.status).toBe(200);
    const { items } = sessionsResponseSchema.parse(res.body);
    expect(items.map((s) => [s.device, s.current])).toEqual([
      ['Firefox on macOS', true],
      ['Chrome on Windows', false],
    ]);
    expect(items[0].ip).toBeTruthy();
    expect((await listSessions(chrome)).body.items[0]).toMatchObject({ device: 'Chrome on Windows', current: true });
  });

  it('leaves out signed-out, expired and other users’ sessions', async () => {
    const user = await makeUser();
    const cookies = await signIn();
    const signedOut = await signIn();
    await request(app).post('/api/auth/logout').set('Cookie', signedOut).expect(204);
    await RefreshToken.create({ user: user._id, tokenHash: 'expired', familyId: 'old', expiresAt: new Date(Date.now() - 1000) });
    const other = await User.create({ name: 'Other', email: 'other@inventory.local', status: 'active', emailVerified: true });
    await RefreshToken.create({ user: other._id, tokenHash: 'other', familyId: 'theirs', expiresAt: new Date(Date.now() + 60_000) });

    const { items } = (await listSessions(cookies)).body;

    expect(items).toHaveLength(1);
    expect(items[0].current).toBe(true);
  });

  it('a token from before sessions were tracked is its own unknown-device session', async () => {
    const user = await makeUser();
    const cookies = await signIn();
    await RefreshToken.create({ user: user._id, tokenHash: 'legacy', expiresAt: new Date(Date.now() + 60_000) });

    const { items } = (await listSessions(cookies)).body;

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ device: 'Unknown device', ip: null, current: false });
  });

  it('needs a signed-in, active account', async () => {
    expect((await request(app).get('/api/auth/sessions')).status).toBe(401);
  });
});

describe('Sign out everywhere', () => {
  it('ends every session at once, this browser included', async () => {
    await makeUser();
    const here = await signIn();
    const elsewhere = await signIn(FIREFOX_MAC);

    const res = await request(app).delete('/api/auth/sessions').set('Cookie', here);

    expect(res.status).toBe(204);
    expect(cookieHeader(res.headers['set-cookie'])).toEqual([]); // both cookies cleared
    expect(await RefreshToken.countDocuments({ revoked: false })).toBe(0);
    // Access tokens stop working now, not when they expire in 15 minutes
    expect((await me(elsewhere)).status).toBe(401);
    expect((await me(here)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', elsewhere)).status).toBe(401);
  });

  it('a refresh token from before the cutoff that escaped revocation (a refresh racing it) does not renew', async () => {
    const user = await makeUser();
    const here = await signIn();
    // The race: this browser's token was claimed and re-issued while sign out everywhere ran,
    // so it is not revoked although it predates the cutoff
    await User.updateOne({ _id: user._id }, { sessionsValidAfter: new Date(Date.now() + 1000) });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', here);

    expect(res.status).toBe(401);
    expect(await RefreshToken.countDocuments({ revoked: false })).toBe(0);
  });

  it('signing in again afterwards works', async () => {
    await makeUser();
    const here = await signIn();
    await request(app).delete('/api/auth/sessions').set('Cookie', here).expect(204);

    expect((await me(await signIn())).status).toBe(200);
  });
});

describe('other events that end every session also end them at once', () => {
  it('changing the password: other browsers lose access now, this one keeps a fresh session', async () => {
    await makeUser();
    const here = await signIn();
    const elsewhere = await signIn(FIREFOX_MAC);

    const res = await request(app)
      .post('/api/auth/password')
      .set('Cookie', here)
      .send({ currentPassword: PASSWORD, newPassword: 'Br4nd-new-password' });

    expect(res.status).toBe(200);
    expect((await me(elsewhere)).status).toBe(401);
    expect((await me(cookieHeader(res.headers['set-cookie']))).status).toBe(200);
  });

  it('a reused refresh token (theft) ends every session now', async () => {
    await makeUser();
    const stolen = await signIn();
    const rotated = await refresh(stolen);

    expect((await request(app).post('/api/auth/refresh').set('Cookie', stolen)).status).toBe(401);
    expect((await me(rotated)).status).toBe(401);
  });

  it('an admin temporary password ends the user’s sessions now', async () => {
    const user = await makeUser();
    const cookies = await signIn();
    const admin = await User.create({ name: 'Admin', email: 'boss@inventory.local', passwordHash: await hashPassword(PASSWORD), role: 'admin', status: 'active', emailVerified: true });
    const adminCookies = cookieHeader(
      (await request(app).post('/api/auth/login').send({ email: admin.email, password: PASSWORD })).headers['set-cookie']
    );

    await request(app).post(`/api/users/${user._id}/password/temp`).set('Cookie', adminCookies).expect(200);

    expect((await me(cookies)).status).toBe(401);
  });
});

describe('describeUserAgent', () => {
  it.each([
    [CHROME_WINDOWS, 'Chrome on Windows'],
    [FIREFOX_MAC, 'Firefox on macOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', 'Edge on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iOS'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', 'Firefox on Linux'],
    ['curl/8.5.0', 'Unknown device'],
    [undefined, 'Unknown device'],
  ])('%s -> %s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected);
  });
});
