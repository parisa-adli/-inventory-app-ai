import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { ACCESS_COOKIE, signAccessToken } from '../services/jwt.js';
import { hashPassword } from '../services/password.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

// PRD §2 permission matrix for every guarded route that exists today. Sessions are minted directly
// (a rejected user cannot log in), and the guards re-read the user from the DB on every request.

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';
const WRONG_PASSWORD = { currentPassword: 'not-my-password', newPassword: 'An0ther-Passw0rd' };

const PERSONAS = {
  unverified: { role: 'staff', status: 'pending', emailVerified: false },
  pending: { role: 'staff', status: 'pending', emailVerified: true },
  rejected: { role: 'staff', status: 'rejected', emailVerified: true },
  staff: { role: 'staff', status: 'active', emailVerified: true },
  admin: { role: 'admin', status: 'active', emailVerified: true },
} as const;
type Persona = 'anonymous' | keyof typeof PERSONAS;
const PERSONA_NAMES: Persona[] = ['anonymous', 'unverified', 'pending', 'rejected', 'staff', 'admin'];

type Method = 'get' | 'post' | 'patch' | 'delete';
/** [status, error code] or a bare status for a success. */
type Expected = [number, string] | number;

interface RouteCase {
  method: Method;
  /** `:id` is replaced by a fresh pending, unverified staff user created per test. */
  path: string;
  body?: object;
  expect: Record<Persona, Expected>;
}

const UNAUTH: Expected = [401, 'UNAUTHORIZED'];

/** Routes behind an admin-only permission (`can(USERS_MANAGE)`, `can(CATEGORIES_DELETE)`, ...): every gate in order, then the permission. `admin` is what the handler answers. */
const adminRoute = (method: Method, path: string, admin: Expected, body?: object): RouteCase => ({
  method,
  path,
  body,
  expect: {
    anonymous: UNAUTH,
    unverified: [403, 'EMAIL_UNVERIFIED'],
    pending: [403, 'ACCOUNT_PENDING'],
    rejected: [403, 'ACCOUNT_REJECTED'],
    staff: [403, 'FORBIDDEN'],
    admin,
  },
});

/** Routes behind `signedIn`: any session works; what follows is the handler's own answer. */
const selfServiceRoute = (
  method: Method,
  path: string,
  answers: Omit<Record<Persona, Expected>, 'anonymous'>,
  body?: object
): RouteCase => ({ method, path, body, expect: { anonymous: UNAUTH, ...answers } });

/** Routes behind `authenticated`: every gate in order; `answer` is what staff and admins get (Profile, C13). */
const accountRoute = (method: Method, path: string, answer: Expected, body?: object): RouteCase => ({
  method,
  path,
  body,
  expect: {
    anonymous: UNAUTH,
    unverified: [403, 'EMAIL_UNVERIFIED'],
    pending: [403, 'ACCOUNT_PENDING'],
    rejected: [403, 'ACCOUNT_REJECTED'],
    staff: answer,
    admin: answer,
  },
});

const sameForAll = (expected: Expected) => ({
  unverified: expected,
  pending: expected,
  rejected: expected,
  staff: expected,
  admin: expected,
});

const ROUTES: RouteCase[] = [
  selfServiceRoute('get', '/api/auth/me', sameForAll(200)),
  selfServiceRoute('post', '/api/auth/resend-verification', sameForAll(200)),
  // Only an unverified user may change their email; the 403 here is the handler's rule, not a guard
  selfServiceRoute(
    'patch',
    '/api/auth/email',
    { ...sameForAll([403, 'FORBIDDEN']), unverified: 200 },
    { email: 'new-address@inventory.local' }
  ),
  // A wrong current password proves the guard let the request through without changing anything
  selfServiceRoute('post', '/api/auth/password', sameForAll([400, 'INVALID_CREDENTIALS']), WRONG_PASSWORD),

  // Every persona has a password and no Telegram link, so the sign-in-method rules answer
  accountRoute('patch', '/api/auth/me', 200, { name: 'Renamed' }),
  accountRoute('post', '/api/auth/password/set', [409, 'PASSWORD_ALREADY_SET'], { newPassword: 'An0ther-Passw0rd' }),
  accountRoute('delete', '/api/auth/password', [409, 'LAST_SIGN_IN_METHOD']),
  accountRoute('delete', '/api/auth/telegram', 200),
  accountRoute('get', '/api/auth/sessions', 200),
  accountRoute('delete', '/api/auth/sessions', 204),
  accountRoute('post', '/api/auth/telegram/link', 201),

  // Phase 2 catalog: reads, create and edit for every active user, delete admin only (C15).
  // `:id` is a user id, so not found
  accountRoute('get', '/api/categories', 200),
  accountRoute('post', '/api/categories', 201, { title: 'Snacks' }),
  accountRoute('patch', '/api/categories/:id', [404, 'NOT_FOUND'], { title: 'Snacks' }),
  adminRoute('delete', '/api/categories/:id', [404, 'NOT_FOUND']),
  accountRoute('get', '/api/suppliers', 200),
  accountRoute('post', '/api/suppliers', 201, { name: 'Acme' }),
  accountRoute('patch', '/api/suppliers/:id', [404, 'NOT_FOUND'], { name: 'Acme' }),
  adminRoute('delete', '/api/suppliers/:id', [404, 'NOT_FOUND']),

  // Products (#29): reads and create for every active user. An incomplete body proves the guard let it through
  accountRoute('get', '/api/products', 200),
  accountRoute('post', '/api/products', [400, 'VALIDATION_ERROR'], { title: 'Widget' }),
  // Stock history (#32): every active user (INVENTORY_VIEW)
  accountRoute('get', '/api/stock-movements', 200),
  // Stock changes (#30): every active user (STOCK_ADJUST); the product does not exist
  accountRoute('post', '/api/stock-movements', [404, 'NOT_FOUND'], {
    productId: '000000000000000000000000',
    type: 'receive',
    quantity: 1,
  }),

  adminRoute('get', '/api/users', 200),
  adminRoute('patch', '/api/users/:id', 200, { role: 'staff' }),
  adminRoute('post', '/api/users/:id/password/temp', 200),
  adminRoute('post', '/api/users/:id/email/verify-manually', 200),
  adminRoute('post', '/api/users/:id/email/verify/resend', 200),
  adminRoute('delete', '/api/users/:id/credentials/telegram', 200),
  adminRoute('patch', '/api/users/:id/activate', [400, 'EMAIL_NOT_VERIFIED']),
  adminRoute('patch', '/api/users/:id/reject', 200),
  adminRoute('patch', '/api/users/:id/reactivate', [409, 'NOT_REJECTED']),
];

let counter = 0;
const makeUser = async (fields: object) =>
  User.create({
    name: 'Someone',
    email: `matrix${++counter}@inventory.local`,
    passwordHash: await hashPassword(PASSWORD),
    ...fields,
  });

const cookieFor = (id: unknown) => [`${ACCESS_COOKIE}=${signAccessToken(String(id))}`];

const send = (method: Method, path: string, cookie: string[] | null, body?: object) => {
  const req = request(app)[method](path);
  if (cookie) req.set('Cookie', cookie);
  return body ? req.send(body) : req;
};

const expectAnswer = (res: request.Response, expected: Expected) => {
  if (typeof expected === 'number') {
    expect(res.status, JSON.stringify(res.body)).toBe(expected);
    return;
  }
  expect({ status: res.status, code: res.body?.error?.code }).toEqual({ status: expected[0], code: expected[1] });
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('access matrix', () => {
  const cases = ROUTES.flatMap((route) =>
    PERSONA_NAMES.map((persona) => [route.method.toUpperCase(), route.path, persona, route] as const)
  );

  it.each(cases)('%s %s as %s', async (_method, _path, persona, route) => {
    const target = await makeUser({ emailVerified: false });
    // The admin persona is never the last active admin, so self/last-admin rules stay out of the way
    await makeUser(PERSONAS.admin);
    const cookie = persona === 'anonymous' ? null : cookieFor((await makeUser(PERSONAS[persona]))._id);

    const res = await send(route.method, route.path.replace(':id', String(target._id)), cookie, route.body);

    expectAnswer(res, route.expect[persona]);
  });
});

describe('gates on a live session', () => {
  it('a user on a temporary password reaches /me and change-password, nothing else, until they change it', async () => {
    const admin = await makeUser({ ...PERSONAS.admin, mustChangePassword: true });
    const cookie = cookieFor(admin._id);

    expectAnswer(await send('get', '/api/auth/me', cookie), 200);
    expectAnswer(await send('get', '/api/users', cookie), [403, 'PASSWORD_CHANGE_REQUIRED']);

    const changed = await send('post', '/api/auth/password', cookie, {
      currentPassword: PASSWORD,
      newPassword: 'Br4nd-new-password',
    });
    expectAnswer(changed, 200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    // Changing the password ends every session; this browser continues on the fresh one it was given
    expectAnswer(await send('get', '/api/users', cookie), [401, 'UNAUTHORIZED']);
    expectAnswer(await send('get', '/api/users', cookieHeader(changed.headers['set-cookie'])), 200);
  });

  // Item 2: the 15-minute access token carries no rights of its own; the guards read the DB
  it('an admin demoted after their token was issued loses admin routes on the next request', async () => {
    await makeUser(PERSONAS.admin);
    const admin = await makeUser(PERSONAS.admin);
    const cookie = cookieFor(admin._id);
    expectAnswer(await send('get', '/api/users', cookie), 200);

    await User.updateOne({ _id: admin._id }, { role: 'staff' });
    expectAnswer(await send('get', '/api/users', cookie), [403, 'FORBIDDEN']);

    await User.updateOne({ _id: admin._id }, { role: 'admin', status: 'rejected' });
    expectAnswer(await send('get', '/api/users', cookie), [403, 'ACCOUNT_REJECTED']);
  });

  it('a deleted user is 401 even with a valid token', async () => {
    const staff = await makeUser(PERSONAS.staff);
    await User.deleteOne({ _id: staff._id });
    expectAnswer(await send('get', '/api/auth/me', cookieFor(staff._id)), UNAUTH);
  });
});

describe('public routes stay unguarded', () => {
  // Anonymous callers reach the handler: every answer here is the handler's, never a guard's 401/403
  const PUBLIC: [Method, string, Expected][] = [
    ['get', '/api/health', 200],
    ['post', '/api/auth/register', [400, 'VALIDATION_ERROR']],
    ['post', '/api/auth/login', [400, 'VALIDATION_ERROR']],
    ['post', '/api/auth/forgot-password', [400, 'VALIDATION_ERROR']],
    ['post', '/api/auth/reset-password/some-token', [400, 'VALIDATION_ERROR']],
    ['get', '/api/auth/verify-email/some-token', [400, 'INVALID_TOKEN']],
    ['post', '/api/auth/logout', 204],
    ['get', '/api/auth/telegram/status', 200],
  ];

  it.each(PUBLIC)('%s %s', async (method, path, expected) => {
    expectAnswer(await send(method, path, null), expected);
  });
});
