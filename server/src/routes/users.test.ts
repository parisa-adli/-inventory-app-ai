import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';

let counter = 0;
const makeUser = async (overrides: Record<string, unknown> = {}) =>
  User.create({
    name: 'Someone',
    email: `user${++counter}@inventory.local`,
    passwordHash: await hashPassword(PASSWORD),
    ...overrides,
  });

/** Logs in and returns the Cookie header for follow-up requests. */
const sessionFor = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return cookieHeader(res.headers['set-cookie']);
};

const adminSession = async () => {
  const admin = await makeUser({ name: 'Admin', role: 'admin', status: 'active', emailVerified: true });
  return sessionFor(admin.email);
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('guards', () => {
  const routes = [
    ['get', '/api/users'],
    ['patch', '/api/users/000000000000000000000000/activate'],
    ['patch', '/api/users/000000000000000000000000/reject'],
    ['patch', '/api/users/000000000000000000000000/reactivate'],
  ] as const;

  it.each(routes)('%s %s answers 401 without a session', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s %s answers 403 for an active staff user', async (method, url) => {
    const staff = await makeUser({ status: 'active', emailVerified: true });
    const res = await request(app)[method](url).set('Cookie', await sessionFor(staff.email));
    expect(res.status).toBe(403);
  });

  it('answers 403 for an admin whose account is no longer active', async () => {
    const admin = await makeUser({ role: 'admin', status: 'active', emailVerified: true });
    const cookie = await sessionFor(admin.email);
    await User.updateOne({ _id: admin._id }, { status: 'rejected' });

    const res = await request(app).get('/api/users').set('Cookie', cookie);

    expect(res.status).toBe(403);
  });

  it('does not let a staff user change another user', async () => {
    const staff = await makeUser({ status: 'active', emailVerified: true });
    const target = await makeUser({ emailVerified: true });
    const res = await request(app)
      .patch(`/api/users/${target._id}/activate`)
      .set('Cookie', await sessionFor(staff.email));
    expect(res.status).toBe(403);
    expect((await User.findById(target._id))?.status).toBe('pending');
  });
});

describe('GET /api/users', () => {
  it('lists only users with the requested status, newest first, without credentials', async () => {
    const cookie = await adminSession();
    await makeUser({ name: 'Old', emailVerified: true, createdAt: new Date('2026-01-01') });
    await makeUser({ name: 'New', emailVerified: false, createdAt: new Date('2026-02-01'), telegramChatId: '42' });
    await makeUser({ name: 'Rejected', status: 'rejected' });

    const res = await request(app).get('/api/users?status=pending').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.items.map((u: { name: string }) => u.name)).toEqual(['New', 'Old']);
    expect(res.body).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1 });
    expect(res.body.items[0]).toMatchObject({ emailVerified: false, telegramLinked: true, status: 'pending' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|telegramChatId/);
  });

  it('paginates', async () => {
    const cookie = await adminSession();
    for (let i = 0; i < 5; i++) await makeUser({ name: `P${i}`, createdAt: new Date(2026, 0, i + 1) });

    const res = await request(app).get('/api/users?status=pending&page=2&limit=2').set('Cookie', cookie);

    expect(res.body.items.map((u: { name: string }) => u.name)).toEqual(['P2', 'P1']);
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it.each(['status=nope', 'page=0', 'limit=1000'])('400s on invalid query %s', async (query) => {
    const res = await request(app).get(`/api/users?${query}`).set('Cookie', await adminSession());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/users/:id/activate', () => {
  it('activates a pending, verified user', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ emailVerified: true });

    const res = await request(app).patch(`/api/users/${target._id}/activate`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(target._id), status: 'active' });
    expect((await User.findById(target._id))?.status).toBe('active');
  });

  it('refuses an unverified user with 400 and leaves them pending', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ emailVerified: false });

    const res = await request(app).patch(`/api/users/${target._id}/activate`).set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await User.findById(target._id))?.status).toBe('pending');
  });

  it('409s when the user is not pending', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ status: 'rejected', emailVerified: true });

    const res = await request(app).patch(`/api/users/${target._id}/activate`).set('Cookie', cookie);

    expect(res.status).toBe(409);
    expect((await User.findById(target._id))?.status).toBe('rejected');
  });

  it('404s for an unknown id and 400s for a malformed one', async () => {
    const cookie = await adminSession();
    const unknown = await request(app).patch('/api/users/000000000000000000000000/activate').set('Cookie', cookie);
    expect(unknown.status).toBe(404);
    const malformed = await request(app).patch('/api/users/not-an-id/activate').set('Cookie', cookie);
    expect(malformed.status).toBe(400);
  });

  it('lets the user in on their next request', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ emailVerified: true });
    const targetCookie = await sessionFor(target.email);
    const before = await request(app).get('/api/auth/me').set('Cookie', targetCookie);
    expect(before.body.status).toBe('pending');

    await request(app).patch(`/api/users/${target._id}/activate`).set('Cookie', cookie).expect(200);

    const after = await request(app).get('/api/auth/me').set('Cookie', targetCookie);
    expect(after.body.status).toBe('active');
  });
});

describe('PATCH /api/users/:id/reject', () => {
  it('rejects a pending user, verified or not, and revokes their sessions', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ emailVerified: false });
    const targetCookie = await sessionFor(target.email);
    expect(await RefreshToken.countDocuments({ user: target._id, revoked: false })).toBeGreaterThan(0);

    const res = await request(app).patch(`/api/users/${target._id}/reject`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(target._id), status: 'rejected' });
    expect(await RefreshToken.countDocuments({ user: target._id, revoked: false })).toBe(0);
    const me = await request(app).get('/api/auth/me').set('Cookie', targetCookie);
    expect(me.body.status).toBe('rejected');
  });

  it('revokes an active user: status rejected, sessions ended, access gone on the next request', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ status: 'active', emailVerified: true });
    const targetCookie = await sessionFor(target.email);
    await request(app).get('/api/auth/me').set('Cookie', targetCookie).expect(200);

    const res = await request(app).patch(`/api/users/${target._id}/reject`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(target._id), status: 'rejected' });
    expect(await RefreshToken.countDocuments({ user: target._id, revoked: false })).toBe(0);
    const me = await request(app).get('/api/auth/me').set('Cookie', targetCookie);
    expect(me.body.status).toBe('rejected');
    const data = await request(app).get('/api/users').set('Cookie', targetCookie);
    expect(data.status).toBe(403);
    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', targetCookie);
    expect(refresh.status).toBe(401);
  });

  it('409s when the user is already rejected', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ status: 'rejected', emailVerified: true });

    const res = await request(app).patch(`/api/users/${target._id}/reject`).set('Cookie', cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_ACTIVE_OR_PENDING');
  });

  it('refuses to revoke the admin making the request', async () => {
    const admin = await makeUser({ role: 'admin', status: 'active', emailVerified: true });
    const cookie = await sessionFor(admin.email);

    const res = await request(app).patch(`/api/users/${admin._id}/reject`).set('Cookie', cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_REVOKE_SELF');
    expect((await User.findById(admin._id))?.status).toBe('active');
  });
});

describe('PATCH /api/users/:id/reactivate', () => {
  it('reactivates a rejected user, who can then sign in again', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ status: 'rejected', emailVerified: true });
    const blocked = await request(app).post('/api/auth/login').send({ email: target.email, password: PASSWORD });
    expect(blocked.status).toBe(403);

    const res = await request(app).patch(`/api/users/${target._id}/reactivate`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(target._id), status: 'active' });
    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.status).toBe('active');
  });

  it('round-trips revoke then reactivate', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ status: 'active', emailVerified: true });

    await request(app).patch(`/api/users/${target._id}/reject`).set('Cookie', cookie).expect(200);
    await request(app).patch(`/api/users/${target._id}/reactivate`).set('Cookie', cookie).expect(200);

    expect((await User.findById(target._id))?.status).toBe('active');
  });

  it('409s for users who are not rejected', async () => {
    const cookie = await adminSession();
    for (const status of ['pending', 'active']) {
      const target = await makeUser({ status, emailVerified: true });
      const res = await request(app).patch(`/api/users/${target._id}/reactivate`).set('Cookie', cookie);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NOT_REJECTED');
    }
  });

  it('refuses a rejected user whose email was never verified', async () => {
    const cookie = await adminSession();
    const target = await makeUser({ status: 'rejected', emailVerified: false });

    const res = await request(app).patch(`/api/users/${target._id}/reactivate`).set('Cookie', cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await User.findById(target._id))?.status).toBe('rejected');
  });

  it('404s for an unknown id', async () => {
    const res = await request(app)
      .patch('/api/users/000000000000000000000000/reactivate')
      .set('Cookie', await adminSession());
    expect(res.status).toBe(404);
  });
});
