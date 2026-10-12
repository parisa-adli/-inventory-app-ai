import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.js';
import { sendUserAwaitingApprovalEmail, sendVerificationEmail } from '../services/email.js';
import { startFromBot } from '../services/telegramAuth.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

// Journey: sign up -> account stays pending -> email verified -> admin approves -> signed in.
// Real Express app and real Mongo test database; only the outbound transports (SMTP, Telegram API) are replaced.
vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendVerificationEmail: vi.fn(async () => ({})),
  sendTelegramLinkEmail: vi.fn(async () => ({})),
  sendUserAwaitingApprovalEmail: vi.fn(async () => ({})),
}));
// No importOriginal: telegram.ts and telegramAuth.ts import each other, which would bypass the mock
vi.mock('../services/telegram.js', () => ({
  TELEGRAM_WEBHOOK_PATH: '/api/telegram/webhook',
  isTelegramConfigured: () => false,
  telegramWebhookHandler: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  assertTelegramAvailable: () => {},
  telegramDeepLink: (payload: string) => `https://t.me/inventory_test_bot?start=${payload}`,
  sendTelegramMessage: vi.fn(async () => {}),
}));

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';
const TG = { id: 515151, username: 'journey_user', firstName: 'Jo', lastName: 'Urney' };

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

const sessionFor = async (email: string, password = PASSWORD) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return cookieHeader(res.headers['set-cookie']);
};

const makeAdmin = async () => {
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@inventory.local',
    passwordHash: await hashPassword(PASSWORD),
    role: 'admin',
    status: 'active',
    emailVerified: true,
  });
  return { admin, cookies: await sessionFor(admin.email) };
};

const lastVerificationToken = () => vi.mocked(sendVerificationEmail).mock.calls.at(-1)![2];
const me = (cookies: string[]) => request(app).get('/api/auth/me').set('Cookie', cookies);
const activate = (adminCookies: string[], id: string) =>
  request(app).patch(`/api/users/${id}/activate`).set('Cookie', adminCookies);

/** What the stored account looks like at this step; every step of the journey asserts it. */
const stored = async (email: string) => {
  const user = (await User.findOne({ email }))!;
  return { status: user.status, emailVerified: user.emailVerified, role: user.role };
};

describe('journey: email sign up -> verify -> approve -> in', () => {
  it('stays pending until the email is verified and an admin approves', async () => {
    const { cookies: adminCookies } = await makeAdmin();
    const email = 'journey@inventory.local';

    // 1. Sign up: account exists but is pending and unverified, and nobody is signed in
    const register = await request(app).post('/api/auth/register').send({ name: 'Jo Urney', email, password: PASSWORD });
    expect(register.status).toBe(201);
    expect(register.headers['set-cookie']).toBeUndefined();
    expect(await stored(email)).toEqual({ status: 'pending', emailVerified: false, role: 'staff' });
    const user = (await User.findOne({ email }))!;
    expect(await EmailToken.find({ user: user._id })).toMatchObject([{ type: 'verify-email', consumed: false }]);

    // 2. Signing in works, but the app reports an unverified, pending account (client -> /verify-email)
    const cookies = await sessionFor(email);
    expect((await me(cookies)).body).toMatchObject({ email, status: 'pending', emailVerified: false });

    // 3. An admin cannot approve an unverified user, and the refusal changes nothing
    const early = await activate(adminCookies, String(user._id));
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await stored(email)).toEqual({ status: 'pending', emailVerified: false, role: 'staff' });

    // 4. Verifying the email moves the user to Awaiting Approval (pending + verified) and tells the admins
    const verified = await request(app).get(`/api/auth/verify-email/${lastVerificationToken()}`);
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ verified: true, type: 'verify-email' });
    expect(await stored(email)).toEqual({ status: 'pending', emailVerified: true, role: 'staff' });
    expect((await me(cookies)).body).toMatchObject({ status: 'pending', emailVerified: true });
    await vi.waitFor(() =>
      expect(sendUserAwaitingApprovalEmail).toHaveBeenCalledWith('admin@inventory.local', 'Admin', 'Jo Urney', email, expect.stringContaining('/users'))
    );

    // 5. The admin sees the user in the pending list and approves
    const pending = await request(app).get('/api/users?status=pending').set('Cookie', adminCookies);
    expect(pending.body.items).toMatchObject([{ email, emailVerified: true, status: 'pending' }]);
    const approved = await activate(adminCookies, String(user._id));
    expect(approved.status).toBe(200);
    expect(await stored(email)).toEqual({ status: 'active', emailVerified: true, role: 'staff' });

    // 6. The same session now sees an active account (the dashboard), and a fresh sign in does too
    expect((await me(cookies)).body).toMatchObject({ status: 'active', emailVerified: true });
    expect((await me(await sessionFor(email))).body).toMatchObject({ status: 'active' });
  });
});

describe('journey: Telegram sign up -> verify -> approve -> in', () => {
  /** Browser + bot half of the Telegram sign up; ends with a pending account and its session cookies. */
  const telegramSignUp = async (email: string) => {
    const start = await request(app).post('/api/auth/telegram/start');
    expect(start.status).toBe(201);
    const tgCookies = cookieHeader(start.headers['set-cookie']);
    const nonce = new URL(start.body.deepLink).searchParams.get('start')!;
    const code = (await startFromBot(nonce, TG)).match(/\b(\d{6})\b/)![1];

    const verify = await request(app).post('/api/auth/telegram/verify').set('Cookie', tgCookies).send({ code });
    expect(verify.body.status).toBe('AWAITING_PROFILE');
    expect(await User.countDocuments({ role: 'staff' })).toBe(0);

    const complete = await request(app)
      .post('/api/auth/telegram/complete')
      .set('Cookie', tgCookies)
      .send({ name: 'Jo Urney', email });
    expect(complete.status).toBe(201);
    return cookieHeader(complete.headers['set-cookie']);
  };

  it('stays pending until the email is verified and an admin approves', async () => {
    const { cookies: adminCookies } = await makeAdmin();
    const email = 'tgjourney@inventory.local';

    // 1. Sign up with Telegram: a passwordless, pending, unverified account, already signed in
    const cookies = await telegramSignUp(email);
    expect(await stored(email)).toEqual({ status: 'pending', emailVerified: false, role: 'staff' });
    const user = (await User.findOne({ email }))!;
    expect(user.telegramChatId).toBe(String(TG.id));
    expect(user.passwordHash).toBeUndefined();
    expect((await me(cookies)).body).toMatchObject({ email, status: 'pending', emailVerified: false });

    // 2. An admin cannot approve the unverified user
    const early = await activate(adminCookies, String(user._id));
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await stored(email)).toEqual({ status: 'pending', emailVerified: false, role: 'staff' });

    // 3. Confirming the emailed link verifies the email; the account is still pending
    const verified = await request(app).get(`/api/auth/verify-email/${lastVerificationToken()}`);
    expect(verified.body).toEqual({ verified: true, type: 'verify-email' });
    expect(await stored(email)).toEqual({ status: 'pending', emailVerified: true, role: 'staff' });
    await vi.waitFor(() => expect(sendUserAwaitingApprovalEmail).toHaveBeenCalledTimes(1));

    // 4. Admin approves; the Telegram session the user already holds now reports active
    expect((await activate(adminCookies, String(user._id))).status).toBe(200);
    expect(await stored(email)).toEqual({ status: 'active', emailVerified: true, role: 'staff' });
    expect((await me(cookies)).body).toMatchObject({ status: 'active', emailVerified: true });
  });
});
