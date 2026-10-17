import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { createEmailToken } from '../services/emailToken.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { hashPassword } from '../services/password.js';
import { updateUser } from '../services/userAdmin.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../test/db.js';

// PATCH /api/users/:id and the other admin endpoints added with the guard chain.
// One test per business rule first, then the endpoints' own behaviour.

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';

let counter = 0;
const makeUser = async (fields: object = {}) =>
  User.create({
    name: 'Someone',
    email: `admin-api${++counter}@inventory.local`,
    passwordHash: await hashPassword(PASSWORD),
    ...fields,
  });
const makeAdmin = () => makeUser({ name: 'Admin', role: 'admin', status: 'active', emailVerified: true });
const cookieFor = (id: unknown) => [`${ACCESS_COOKIE}=${signAccessToken(String(id))}`];

const patchUser = (actor: unknown, target: unknown, body: object) =>
  request(app).patch(`/api/users/${target}`).set('Cookie', cookieFor(actor)).send(body);
const postAs = (actor: unknown, path: string) => request(app).post(path).set('Cookie', cookieFor(actor));

const login = (email: string, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);
afterEach(() => vi.restoreAllMocks());

describe('business rules', () => {
  it('an admin cannot approve an unverified user', async () => {
    const admin = await makeAdmin();
    const target = await makeUser({ emailVerified: false });

    const res = await patchUser(admin._id, target._id, { status: 'active' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await User.findById(target._id))?.status).toBe('pending');
  });

  it('an admin cannot reject or demote themselves', async () => {
    const admin = await makeAdmin();
    await makeAdmin(); // not the last admin, so only the self rule can refuse

    const reject = await patchUser(admin._id, admin._id, { status: 'rejected' });
    const demote = await patchUser(admin._id, admin._id, { role: 'staff' });

    expect(reject.status).toBe(403);
    expect(reject.body.error.code).toBe('FORBIDDEN');
    expect(demote.status).toBe(403);
    expect(demote.body.error.code).toBe('FORBIDDEN');
    expect(await User.findById(admin._id)).toMatchObject({ role: 'admin', status: 'active' });
  });

  it('the last active admin cannot be demoted or rejected', async () => {
    // Through the API the caller is itself an active admin, so a lone admin is always the caller
    // (refused by the self rule) unless two demotions race. Call the rule directly for the lone
    // case, then race two admins against each other.
    const lone = await makeAdmin();
    const formerAdmin = await makeUser({ role: 'admin', status: 'rejected', emailVerified: true });
    await expect(updateUser(String(formerAdmin._id), String(lone._id), { role: 'staff' })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    await expect(updateUser(String(formerAdmin._id), String(lone._id), { status: 'rejected' })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(await User.findById(lone._id)).toMatchObject({ role: 'admin', status: 'active' });

    const other = await makeAdmin();
    const results = await Promise.all([
      patchUser(lone._id, other._id, { role: 'staff' }),
      patchUser(other._id, lone._id, { role: 'staff' }),
    ]);

    expect(results.some((res) => res.status === 403)).toBe(true);
    expect(await User.countDocuments({ role: 'admin', status: 'active' })).toBeGreaterThanOrEqual(1);
  });

  it('rejecting a user revokes all of their refresh tokens', async () => {
    const admin = await makeAdmin();
    const target = await makeUser({ status: 'active', emailVerified: true });
    await login(target.email).expect(200);
    await login(target.email).expect(200);
    expect(await RefreshToken.countDocuments({ user: target._id, revoked: false })).toBe(2);

    await patchUser(admin._id, target._id, { status: 'rejected' }).expect(200);

    expect(await RefreshToken.countDocuments({ user: target._id, revoked: false })).toBe(0);
  });

  it('reinstating a user restores their prior role', async () => {
    const admin = await makeAdmin();
    const target = await makeAdmin();

    await patchUser(admin._id, target._id, { status: 'rejected' }).expect(200);
    const res = await patchUser(admin._id, target._id, { status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'admin', status: 'active', statusReason: null });
  });

  it('rejecting a user records statusReason, statusChangedAt and statusChangedBy', async () => {
    const admin = await makeAdmin();
    const target = await makeUser({ emailVerified: true });
    const before = Date.now();

    const res = await patchUser(admin._id, target._id, { status: 'rejected', statusReason: '  Left the company ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'rejected',
      statusReason: 'Left the company',
      statusChangedBy: String(admin._id),
    });
    const stored = await User.findById(target._id);
    expect(stored?.statusReason).toBe('Left the company');
    expect(String(stored?.statusChangedBy)).toBe(String(admin._id));
    expect(stored?.statusChangedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('the temporary password is returned once, forces a change, and is never logged', async () => {
    const logged: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(...args));
    }
    const admin = await makeAdmin();
    const target = await makeUser({ status: 'active', emailVerified: true });
    await login(target.email).expect(200);

    const res = await postAs(admin._id, `/api/users/${target._id}/password/temp`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { temporaryPassword } = res.body as { temporaryPassword: string };
    expect(temporaryPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{16}$/);
    // Stored only as a hash; old password and old sessions are gone
    const stored = await User.findById(target._id);
    expect(stored?.mustChangePassword).toBe(true);
    expect(stored?.passwordHash).not.toContain(temporaryPassword);
    expect(await RefreshToken.countDocuments({ user: target._id, revoked: false })).toBe(0);
    expect((await login(target.email)).status).toBe(401);

    // Signing in works, but only change-password is open
    const session = await login(target.email, temporaryPassword);
    expect(session.status).toBe(200);
    expect(session.body.user.mustChangePassword).toBe(true);

    // A second call issues a different password; the first one stops working
    const again = await postAs(admin._id, `/api/users/${target._id}/password/temp`);
    expect(again.body.temporaryPassword).not.toBe(temporaryPassword);
    expect((await login(target.email, temporaryPassword)).status).toBe(401);

    expect(JSON.stringify(logged.map(String))).not.toContain(temporaryPassword);
    expect(JSON.stringify(logged.map(String))).not.toContain(again.body.temporaryPassword);
  });
});

describe('PATCH /api/users/:id', () => {
  it('approves a verified pending user and promotes or demotes another admin', async () => {
    const admin = await makeAdmin();
    const target = await makeUser({ emailVerified: true });

    const approved = await patchUser(admin._id, target._id, { status: 'active' });
    expect(approved.body).toMatchObject({ status: 'active', statusChangedBy: String(admin._id) });

    const promoted = await patchUser(admin._id, target._id, { role: 'admin' });
    expect(promoted.body).toMatchObject({ role: 'admin', status: 'active' });

    const demoted = await patchUser(admin._id, target._id, { role: 'staff' });
    expect(demoted.body.role).toBe('staff');
  });

  it.each([{}, { status: 'pending' }, { role: 'manager' }, { statusReason: 'x'.repeat(501), status: 'rejected' }])(
    '400s on body %j',
    async (body) => {
      const admin = await makeAdmin();
      const target = await makeUser();
      const res = await patchUser(admin._id, target._id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  );

  it('404s for an unknown user', async () => {
    const admin = await makeAdmin();
    const res = await patchUser(admin._id, '000000000000000000000000', { role: 'staff' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users filters', () => {
  it('filters by role, verified and a case-insensitive search on name or email', async () => {
    const admin = await makeAdmin();
    await makeUser({ name: 'Jane Doe', emailVerified: true });
    await makeUser({ name: 'John Roe', emailVerified: false });
    await makeUser({ name: 'Mallory', email: 'jane.alt@inventory.local', emailVerified: false });
    const list = async (query: string) =>
      (await request(app).get(`/api/users?${query}`).set('Cookie', cookieFor(admin._id))).body.items
        .map((u: { name: string }) => u.name)
        .sort();

    expect(await list('role=admin')).toEqual(['Admin']);
    expect(await list('verified=false')).toEqual(['John Roe', 'Mallory']);
    expect(await list('search=JANE')).toEqual(['Jane Doe', 'Mallory']);
    expect(await list('search=jane&verified=true&role=staff')).toEqual(['Jane Doe']);
    // Regex characters are matched literally
    expect(await list('search=.*')).toEqual([]);
  });
});

describe('GET /api/users sorting', () => {
  // createdAt is immutable once timestamps set it, so it is given at creation
  const seedSortable = async () => {
    const admin = await makeUser({
      name: 'admin',
      role: 'admin',
      status: 'active',
      emailVerified: true,
      createdAt: new Date('2025-01-01'),
    });
    await makeUser({ name: 'bravo', createdAt: new Date('2026-01-01') });
    await makeUser({ name: 'Charlie', status: 'active', emailVerified: true, createdAt: new Date('2026-03-01') });
    await makeUser({ name: 'Alpha', createdAt: new Date('2026-02-01') });
    return admin;
  };
  const names = async (admin: { _id: unknown }, query = '') => {
    const res = await request(app).get(`/api/users?${query}`).set('Cookie', cookieFor(admin._id));
    expect(res.status).toBe(200);
    return res.body.items.map((u: { name: string }) => u.name);
  };

  it('lists newest first when no sort is given, whatever the status', async () => {
    const admin = await seedSortable();
    expect(await names(admin)).toEqual(['Charlie', 'Alpha', 'bravo', 'admin']);
  });

  it.each([
    ['sort=createdAt', ['Charlie', 'Alpha', 'bravo', 'admin']],
    ['sort=createdAt&order=desc', ['Charlie', 'Alpha', 'bravo', 'admin']],
    ['sort=createdAt&order=asc', ['admin', 'bravo', 'Alpha', 'Charlie']],
    ['sort=name', ['admin', 'Alpha', 'bravo', 'Charlie']],
    ['sort=name&order=asc', ['admin', 'Alpha', 'bravo', 'Charlie']],
    ['sort=name&order=desc', ['Charlie', 'bravo', 'Alpha', 'admin']],
  ])('%s orders the list (names ignore case)', async (query, expected) => {
    const admin = await seedSortable();
    expect(await names(admin, query)).toEqual(expected);
  });

  it('breaks ties by _id so paging never repeats or skips a user', async () => {
    const admin = await makeAdmin();
    const sameDay = new Date('2026-01-01');
    for (let i = 0; i < 5; i++) await makeUser({ name: 'Same', createdAt: sameDay });
    const ids = async (query: string) =>
      (await request(app).get(`/api/users?status=pending&${query}`).set('Cookie', cookieFor(admin._id))).body.items.map(
        (u: { id: string }) => u.id
      );

    for (const sort of ['sort=createdAt', 'sort=name']) {
      const pages = [...(await ids(`${sort}&limit=2&page=1`)), ...(await ids(`${sort}&limit=2&page=2`)), ...(await ids(`${sort}&limit=2&page=3`))];
      expect(new Set(pages).size).toBe(5);
      expect(pages).toEqual(await ids(`${sort}&limit=5`));
    }
  });

  it('combines the filters with a sort', async () => {
    const admin = await seedSortable();
    await makeUser({ name: 'Alfred', emailVerified: true, createdAt: new Date('2026-04-01') });
    await makeUser({ name: 'Alfie', createdAt: new Date('2026-05-01') });
    // Seeded emails all contain "al" (inventory.local), so the search names "alf"
    expect(await names(admin, 'status=pending&search=ALF&sort=name&order=desc')).toEqual(['Alfred', 'Alfie']);
    expect(await names(admin, 'status=pending&verified=false&sort=createdAt&order=asc')).toEqual([
      'bravo',
      'Alpha',
      'Alfie',
    ]);
    expect(await names(admin, 'role=admin&sort=name')).toEqual(['admin']);
  });

  it('pages 20 users at a time by default', async () => {
    const admin = await makeAdmin();
    for (let i = 0; i < 21; i++) await makeUser({ name: `U${i}` });
    const res = await request(app).get('/api/users').set('Cookie', cookieFor(admin._id));
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 22, totalPages: 2 });
    expect(res.body.items).toHaveLength(20);
  });

  it.each(['sort=email', 'sort=pendingRank', 'order=up', 'sort=name&order=DESC'])(
    '400s on an unknown sort or order (%s)',
    async (query) => {
      const admin = await makeAdmin();
      const res = await request(app).get(`/api/users?${query}`).set('Cookie', cookieFor(admin._id));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  );
});

describe('email and Telegram credentials', () => {
  it('verify-manually marks the email verified and kills outstanding links', async () => {
    const admin = await makeAdmin();
    const target = await makeUser({ emailVerified: false });
    await createEmailToken(target._id, 'verify-email');

    const res = await postAs(admin._id, `/api/users/${target._id}/email/verify-manually`);

    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);
    expect(await EmailToken.countDocuments({ user: target._id, type: 'verify-email', consumed: false })).toBe(0);
  });

  it('verify/resend sends a new link to an unverified user and 409s for a verified one', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const admin = await makeAdmin();
    const unverified = await makeUser({ emailVerified: false });
    const verified = await makeUser({ emailVerified: true });

    const sent = await postAs(admin._id, `/api/users/${unverified._id}/email/verify/resend`);
    expect(sent.status).toBe(200);
    expect(sent.body.devMailUrl).toMatch(/\/verify-email\//);
    expect(await EmailToken.countDocuments({ user: unverified._id, type: 'verify-email', consumed: false })).toBe(1);

    const conflict = await postAs(admin._id, `/api/users/${verified._id}/email/verify/resend`);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
  });

  it('DELETE credentials/telegram unlinks the chat', async () => {
    const admin = await makeAdmin();
    const target = await makeUser({ telegramChatId: '4242' });

    const res = await request(app)
      .delete(`/api/users/${target._id}/credentials/telegram`)
      .set('Cookie', cookieFor(admin._id));

    expect(res.status).toBe(200);
    expect(res.body.telegramLinked).toBe(false);
    expect((await User.findById(target._id))?.telegramChatId).toBeUndefined();
  });
});
