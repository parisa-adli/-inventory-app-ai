import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { env } from '../config/env.js';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { TelegramLogin } from '../models/TelegramLogin.js';
import { User } from '../models/User.js';
import { signupWithTelegram } from '../services/telegramSignup.js';
import { LOGIN_START_PREFIX, approveTelegramLogin } from '../services/telegramLogin.js';
import { sendTelegramLinkEmail } from '../services/email.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendVerificationEmail: vi.fn(async () => {}),
  sendTelegramLinkEmail: vi.fn(async () => {}),
}));

const app = createApp();
const EMAIL = 'tele@inventory.local';
const CHAT = '9001';

const makeUser = (overrides: Record<string, unknown> = {}) =>
  User.create({
    name: 'Tele User',
    email: EMAIL,
    telegramChatId: CHAT,
    status: 'active',
    emailVerified: true,
    ...overrides,
  });

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

describe('Telegram QR login', () => {
  const startLogin = () => request(app).post('/api/auth/telegram/login');
  const poll = (pollToken: string) => request(app).post('/api/auth/telegram/login/poll').send({ pollToken });

  /** Creates a QR login and returns what the phone (start) and the browser (poll) each hold. */
  const begin = async () => {
    const res = await startLogin();
    expect(res.status).toBe(201);
    const payload = new URL(res.body.deepLink).searchParams.get('start')!;
    const startToken = payload.replace(LOGIN_START_PREFIX, '');
    return { startToken, pollToken: res.body.pollToken as string, body: res.body };
  };

  it('returns a t.me deep link carrying the login payload, a poll token and an expiry', async () => {
    const { body } = await begin();
    expect(body.deepLink).toMatch(/^https:\/\/t\.me\/\w+\?start=login_[0-9a-f]{48}$/);
    expect(body.pollToken).toMatch(/^[0-9a-f]{48}$/);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(4 * 60_000);
  });

  it('polls pending, then logs in once the phone approved, issuing httpOnly cookies', async () => {
    await makeUser();
    const { startToken, pollToken } = await begin();

    const waiting = await poll(pollToken);
    expect(waiting.status).toBe(200);
    expect(waiting.body).toEqual({ status: 'pending' });
    expect(cookieHeader(waiting.headers['set-cookie'])).toHaveLength(0);

    await approveTelegramLogin(startToken, CHAT);
    const done = await poll(pollToken);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'approved', user: { email: EMAIL, status: 'active' } });
    const cookies = cookieHeader(done.headers['set-cookie']);
    expect(cookies).toHaveLength(2);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookies)).status).toBe(200);
  });

  it('is single use: the second poll after a login is expired and sets no cookies', async () => {
    await makeUser();
    const { startToken, pollToken } = await begin();
    await approveTelegramLogin(startToken, CHAT);
    await poll(pollToken);

    const again = await poll(pollToken);
    expect(again.body).toEqual({ status: 'expired' });
    expect(cookieHeader(again.headers['set-cookie'])).toHaveLength(0);
  });

  it('reports unlinked for a chat with no account and never logs anyone in', async () => {
    const { startToken, pollToken } = await begin();
    await approveTelegramLogin(startToken, 'nobody');

    const res = await poll(pollToken);
    expect(res.body).toEqual({ status: 'unlinked' });
    expect(cookieHeader(res.headers['set-cookie'])).toHaveLength(0);
  });

  it('lets a pending, unverified user in (the client routes them by /me)', async () => {
    await makeUser({ status: 'pending', emailVerified: false });
    const { startToken, pollToken } = await begin();
    await approveTelegramLogin(startToken, CHAT);

    const res = await poll(pollToken);
    expect(res.body).toMatchObject({ status: 'approved', user: { status: 'pending', emailVerified: false } });
  });

  it('blocks a rejected user with ACCOUNT_REJECTED and no cookies', async () => {
    await makeUser({ status: 'rejected' });
    const { startToken, pollToken } = await begin();
    await approveTelegramLogin(startToken, CHAT);

    const res = await poll(pollToken);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_REJECTED');
    expect(cookieHeader(res.headers['set-cookie'])).toHaveLength(0);
  });

  it('answers expired for an unknown poll token and validates the body', async () => {
    expect((await poll('does-not-exist')).body).toEqual({ status: 'expired' });

    const bad = await request(app).post('/api/auth/telegram/login/poll').send({});
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  describe('production without a bot token', () => {
    const original = env.NODE_ENV;
    beforeAll(() => {
      env.NODE_ENV = 'production';
    });
    afterAll(() => {
      env.NODE_ENV = original;
    });

    it('answers 503 TELEGRAM_UNAVAILABLE for start and poll, before touching the DB', async () => {
      const start = await startLogin();
      expect(start.status).toBe(503);
      expect(start.body.error.code).toBe('TELEGRAM_UNAVAILABLE');
      expect((await poll('x')).status).toBe(503);
      expect(await TelegramLogin.countDocuments()).toBe(0);
    });
  });
});

describe('GET /api/auth/verify-email/:token with a link-telegram token', () => {
  /** Existing password account + a Telegram signup attempt for the same email -> raw confirm token. */
  const startMerge = async (chatId: string, overrides: Record<string, unknown> = {}) => {
    const user = await makeUser({
      telegramChatId: undefined,
      passwordHash: 'x',
      emailVerified: false,
      ...overrides,
    });
    await signupWithTelegram({ chatId, name: 'Whoever', email: EMAIL });
    const calls = vi.mocked(sendTelegramLinkEmail).mock.calls;
    return { user, token: calls[calls.length - 1][2] };
  };

  it('links the chat to the existing account and reports the type', async () => {
    const { user, token } = await startMerge('7001');
    expect((await User.findById(user._id))!.telegramChatId).toBeUndefined(); // nothing changes before the click

    const res = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('link-telegram');

    const linked = (await User.findById(user._id))!;
    expect(linked.telegramChatId).toBe('7001');
    expect(linked.emailVerified).toBe(false); // linking does not verify the email (PRD §3)
  });

  it('is single use', async () => {
    const { token } = await startMerge('7001');
    await request(app).get(`/api/auth/verify-email/${token}`);
    const again = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
  });

  it('replaces a different chat that was linked before', async () => {
    const { user, token } = await startMerge('7001');
    await User.updateOne({ _id: user._id }, { telegramChatId: '6000' });

    expect((await request(app).get(`/api/auth/verify-email/${token}`)).status).toBe(200);
    expect((await User.findById(user._id))!.telegramChatId).toBe('7001');
  });

  it('refuses when the chat got linked to another account in the meantime', async () => {
    const { user, token } = await startMerge('7001');
    await User.create({ name: 'Thief', email: 'other@inventory.local', telegramChatId: '7001' });

    const res = await request(app).get(`/api/auth/verify-email/${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
    expect((await User.findById(user._id))!.telegramChatId).toBeUndefined();
  });

  it('only the newest confirm link works', async () => {
    const first = await startMerge('7001');
    await signupWithTelegram({ chatId: '7002', name: 'Whoever', email: EMAIL });
    const calls = vi.mocked(sendTelegramLinkEmail).mock.calls;
    const second = calls[calls.length - 1][2];

    expect((await request(app).get(`/api/auth/verify-email/${first.token}`)).status).toBe(400);
    expect((await request(app).get(`/api/auth/verify-email/${second}`)).status).toBe(200);
    expect((await User.findOne({ email: EMAIL }))!.telegramChatId).toBe('7002');
    expect(await EmailToken.countDocuments({ type: 'link-telegram', consumed: false })).toBe(0);
  });

  it('an email-verification response carries the verify-email type', async () => {
    const user = await makeUser({ emailVerified: false });
    const { createEmailToken } = await import('../services/emailToken.js');
    const raw = await createEmailToken(user._id, 'verify-email');

    const res = await request(app).get(`/api/auth/verify-email/${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('verify-email');
  });
});
