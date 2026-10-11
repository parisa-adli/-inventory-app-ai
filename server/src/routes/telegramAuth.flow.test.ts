import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { AuthSession } from '../models/AuthSession.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import { sendTelegramLinkEmail, sendVerificationEmail } from '../services/email.js';
import { sendTelegramMessage } from '../services/telegram.js';
import { createAuthSession, startFromBot } from '../services/telegramAuth.js';
import { sha256 } from '../utils/crypto.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendVerificationEmail: vi.fn(async () => {}),
  sendTelegramLinkEmail: vi.fn(async () => {}),
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
const TG = { id: 424242, username: 'tele_user', firstName: 'Tele', lastName: 'User' };

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

/** The Set-Cookie headers of a response as a list. */
const setCookies = (res: { headers: Record<string, unknown> }): string[] => [res.headers['set-cookie'] ?? []].flat() as string[];
const hasSession = (res: { headers: Record<string, unknown> }) =>
  setCookies(res).some((c) => c.startsWith('access_token=') && !c.startsWith('access_token=;'));

const codeFrom = (message: string) => message.match(/\b(\d{6})\b/)![1];
const nonceOf = (deepLink: string) => new URL(deepLink).searchParams.get('start')!;

/** Browser side: POST /telegram/start. Returns the cookie header and the nonce from the deep link. */
const start = async () => {
  const res = await request(app).post('/api/auth/telegram/start');
  expect(res.status).toBe(201);
  return { res, cookies: cookieHeader(res.headers['set-cookie']), nonce: nonceOf(res.body.deepLink) };
};

/** Bot side: "/start <nonce>" -> the code the user sees in the chat. */
const botStart = async (nonce: string, from = TG) => codeFrom(await startFromBot(nonce, from));

const verify = (cookies: string[], code: string) =>
  request(app).post('/api/auth/telegram/verify').set('Cookie', cookies).send({ code });

const wrongCode = (right: string) => (right === '000000' ? '111111' : '000000');

/** A browser that scanned the QR code and got a code from the bot. */
const withCode = async (from = TG) => {
  const session = await start();
  const code = await botStart(session.nonce, from);
  return { ...session, code };
};

describe('Telegram sign in / sign up: start', () => {
  it('sets an httpOnly session cookie scoped to /api/auth/telegram and returns a deep link', async () => {
    const { res } = await start();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tg_auth_session='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/telegram/i);
    expect(res.body.deepLink).toMatch(/^https:\/\/t\.me\/\w+\?start=[0-9a-f]{48}$/);
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });

  it('stores only hashes of the session id and the nonce', async () => {
    const { cookies, nonce } = await start();
    const sessionId = cookies[0].split('=')[1];
    const stored = (await AuthSession.findOne())!;
    expect(stored.sessionIdHash).toBe(sha256(sessionId));
    expect(stored.nonceHash).toBe(sha256(nonce));
    expect(JSON.stringify(stored)).not.toContain(nonce);
  });

  it('reports EXPIRED for a browser without a (known) session', async () => {
    expect((await request(app).get('/api/auth/telegram/status')).body).toEqual({ status: 'EXPIRED' });
    const res = await request(app).get('/api/auth/telegram/status').set('Cookie', ['tg_auth_session=nope']);
    expect(res.body).toEqual({ status: 'EXPIRED' });
  });
});

describe('Telegram sign in / sign up: the bot', () => {
  it('hands out a code once; a second Start never overwrites the Telegram account', async () => {
    const { nonce } = await start();
    const first = await startFromBot(nonce, TG);
    expect(first).toMatch(/\d{6}/);

    const second = await startFromBot(nonce, { ...TG, id: 999 });
    expect(second).not.toMatch(/\d{6}/);
    expect((await AuthSession.findOne())!.telegramId).toBe(TG.id);
  });

  it('refuses an unknown nonce and an expired session', async () => {
    expect(await startFromBot('f'.repeat(48), TG)).not.toMatch(/\d{6}/);
    const { nonce } = await start();
    await AuthSession.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    expect(await startFromBot(nonce, TG)).not.toMatch(/\d{6}/);
  });

  it('moves the session to AWAITING_OTP and exposes the resend time to the browser', async () => {
    const { cookies, nonce } = await start();
    await botStart(nonce);
    const status = (await request(app).get('/api/auth/telegram/status').set('Cookie', cookies)).body;
    expect(status.status).toBe('AWAITING_OTP');
    expect(new Date(status.otpExpiresAt).getTime() - Date.now()).toBeLessThanOrEqual(2 * 60_000);
    expect(new Date(status.resendAvailableAt).getTime() - Date.now()).toBeGreaterThan(55_000);
  });
});

describe('Telegram sign in (account already linked)', () => {
  it('signs a linked, active account in and clears the attempt cookie', async () => {
    const user = await User.create({ name: 'Tele', email: 'tele@inventory.local', telegramChatId: String(TG.id), status: 'active', emailVerified: true });
    const { cookies, code } = await withCode();

    const res = await verify(cookies, code);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'COMPLETED', user: { id: String(user._id), email: 'tele@inventory.local' } });
    const set = res.headers['set-cookie'] as unknown as string[];
    expect(set.some((c) => c.startsWith('access_token=') && !c.startsWith('access_token=;'))).toBe(true);
    expect(set.some((c) => c.startsWith('refresh_token='))).toBe(true);

    // single use: the same code cannot be replayed (the attempt is already COMPLETED)
    const replay = await verify(cookies, code);
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('NO_CODE_PENDING');
  });

  it('lets a pending user in (routed to awaiting approval by /me) but never a rejected one', async () => {
    await User.create({ name: 'P', email: 'p@inventory.local', telegramChatId: String(TG.id), status: 'pending' });
    const pending = await withCode();
    expect((await verify(pending.cookies, pending.code)).status).toBe(200);

    await clearTestDb();
    await User.create({ name: 'R', email: 'r@inventory.local', telegramChatId: String(TG.id), status: 'rejected' });
    const rejected = await withCode();
    const res = await verify(rejected.cookies, rejected.code);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_REJECTED');
    expect(hasSession(res)).toBeFalsy();
  });
});

describe('Telegram code limits', () => {
  it('rejects a wrong code with the attempts left, and locks after 5 wrong codes', async () => {
    const { cookies, code } = await withCode();
    const bad = wrongCode(code);

    for (let left = 4; left >= 1; left--) {
      const res = await verify(cookies, bad);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(res.body.error.message).toContain(`${left} attempt`);
    }
    const fifth = await verify(cookies, bad);
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect((await AuthSession.findOne())!.status).toBe('LOCKED');

    // even the right code no longer works, and the status reflects the lock
    expect((await verify(cookies, code)).status).toBe(423);
    expect((await request(app).get('/api/auth/telegram/status').set('Cookie', cookies)).body.status).toBe('LOCKED');
  });

  it('expires a code after 2 minutes', async () => {
    const { cookies, code } = await withCode();
    await AuthSession.updateOne({}, { otpExpiresAt: new Date(Date.now() - 1000) });
    const res = await verify(cookies, code);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('validates the submitted code shape (6 digits)', async () => {
    const { cookies } = await withCode();
    for (const code of ['', '12345', '1234567', 'abcdef']) {
      const res = await verify(cookies, code);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await AuthSession.findOne())!.attempts).toBe(0);
  });

  it('answers 409 when no code was requested yet', async () => {
    const { cookies } = await start();
    const res = await verify(cookies, '123456');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_CODE_PENDING');
  });

  it('resend: 60 s cooldown, a new code replaces the old one, attempts reset, max 3 resends', async () => {
    const { cookies, code } = await withCode();
    const resend = () => request(app).post('/api/auth/telegram/resend').set('Cookie', cookies);
    const backdate = () => AuthSession.updateOne({}, { lastSentAt: new Date(Date.now() - 61_000) });

    const early = await resend();
    expect(early.status).toBe(429);
    expect(early.body.error.code).toBe('RESEND_COOLDOWN');
    expect(sendTelegramMessage).not.toHaveBeenCalled();

    // burn 2 attempts, then resend: attempts go back to 0 and the old code is dead
    await verify(cookies, wrongCode(code));
    await verify(cookies, wrongCode(code));
    await backdate();
    const first = await resend();
    expect(first.status).toBe(200);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = vi.mocked(sendTelegramMessage).mock.calls[0];
    expect(chatId).toBe(TG.id);
    const newCode = codeFrom(text as string);
    expect((await AuthSession.findOne())!.attempts).toBe(0);

    for (let i = 2; i <= 3; i++) {
      await backdate();
      expect((await resend()).status).toBe(200);
    }
    await backdate();
    const over = await resend();
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RESEND_LIMIT');
    expect(sendTelegramMessage).toHaveBeenCalledTimes(3);

    // the browser is told there is no further resend
    const status = (await request(app).get('/api/auth/telegram/status').set('Cookie', cookies)).body;
    expect(status.resendAvailableAt).toBeNull();
    expect(newCode).not.toBe(code);
  });
});

describe('Telegram sign up (new Telegram account)', () => {
  it('asks for username + email after the code, then creates a pending, unverified, passwordless user and signs in', async () => {
    const { cookies, code } = await withCode();

    const verified = await verify(cookies, code);
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ status: 'AWAITING_PROFILE', prefillDisplayName: 'Tele User' });
    expect(hasSession(verified)).toBeFalsy();

    const res = await request(app)
      .post('/api/auth/telegram/complete')
      .set('Cookie', cookies)
      .send({ name: 'Tele User', email: 'New@Inventory.local' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'COMPLETED', outcome: 'created', user: { email: 'new@inventory.local', status: 'pending', emailVerified: false } });
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

    const user = (await User.findOne({ email: 'new@inventory.local' }))!;
    expect(user).toMatchObject({ role: 'staff', status: 'pending', emailVerified: false, telegramChatId: String(TG.id) });
    expect(user.passwordHash).toBeUndefined();
    expect(hasSession(res)).toBe(true);

    // the next Telegram sign in with the same account now takes the sign in path
    const again = await withCode();
    expect((await verify(again.cookies, again.code)).body.status).toBe('COMPLETED');
  });

  it('refuses the form before the code is verified', async () => {
    const { cookies } = await withCode();
    const res = await request(app).post('/api/auth/telegram/complete').set('Cookie', cookies).send({ name: 'X Y', email: 'x@inventory.local' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_VERIFIED');
    expect(await User.countDocuments()).toBe(0);
  });

  it('validates name and email', async () => {
    const { cookies, code } = await withCode();
    await verify(cookies, code);
    const res = await request(app).post('/api/auth/telegram/complete').set('Cookie', cookies).send({ name: '', email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('existing email: no second account, a confirm link is mailed and nobody is signed in', async () => {
    const owner = await User.create({ name: 'Owner', email: 'owner@inventory.local', passwordHash: 'x', status: 'active', emailVerified: true });
    const { cookies, code } = await withCode();
    await verify(cookies, code);

    const res = await request(app).post('/api/auth/telegram/complete').set('Cookie', cookies).send({ name: 'Tele', email: 'owner@inventory.local' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'COMPLETED', outcome: 'link-sent' });
    expect(hasSession(res)).toBeFalsy();
    expect(await User.countDocuments()).toBe(1);
    expect(sendTelegramLinkEmail).toHaveBeenCalledTimes(1);
    expect((await User.findById(owner._id))!.telegramChatId).toBeUndefined();
  });

  it('locks the form after 5 failed submissions', async () => {
    vi.mocked(sendVerificationEmail).mockRejectedValue(new Error('smtp down'));
    const { cookies, code } = await withCode();
    await verify(cookies, code);
    const submit = () => request(app).post('/api/auth/telegram/complete').set('Cookie', cookies).send({ name: 'Tele', email: 'new@inventory.local' });

    for (let i = 0; i < 5; i++) expect((await submit()).status).toBeGreaterThanOrEqual(500);
    const locked = await submit();
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(await User.countDocuments()).toBe(0);
    vi.mocked(sendVerificationEmail).mockImplementation(async () => undefined as never);
  });
});

describe('Telegram per-IP rate limits (forced on)', () => {
  beforeAll(() => {
    process.env.FORCE_RATE_LIMIT = '1';
  });
  afterAll(() => {
    delete process.env.FORCE_RATE_LIMIT;
  });

  it('limits start to 10 per 15 minutes, answering 429 RATE_LIMITED', async () => {
    for (let i = 0; i < 10; i++) expect((await request(app).post('/api/auth/telegram/start')).status).toBe(201);
    const res = await request(app).post('/api/auth/telegram/start');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('limits verify to 30 per 15 minutes', async () => {
    const { sessionId } = await createAuthSession();
    const cookies = [`tg_auth_session=${sessionId}`];
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await verify(cookies, '123456')).status);
    expect(statuses.slice(0, 30).every((status) => status !== 429)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('Database state of a Telegram sign up / sign in', () => {
  const complete = (cookies: string[], body: { name: string; email: string }) =>
    request(app).post('/api/auth/telegram/complete').set('Cookie', cookies).send(body);

  it('persists a pending, unverified, passwordless staff user with the Telegram id and one verify-email token', async () => {
    const { cookies, code } = await withCode();
    await verify(cookies, code);
    const res = await complete(cookies, { name: 'Tele User', email: 'persist@inventory.local' });
    expect(res.status).toBe(201);

    const user = (await User.findOne({ email: 'persist@inventory.local' }))!;
    expect(user).toMatchObject({
      name: 'Tele User',
      role: 'staff',
      status: 'pending',
      emailVerified: false,
      telegramChatId: String(TG.id),
    });
    expect(user.passwordHash).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);

    const tokens = await EmailToken.find({ user: user._id });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: 'verify-email', consumed: false });
    expect(tokens[0].telegramChatId).toBeUndefined();
    expect(tokens[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000);

    // the attempt records who it created, and keeps no usable code
    const session = (await AuthSession.findOne())!;
    expect(session).toMatchObject({ status: 'COMPLETED', purpose: 'SIGNUP', telegramId: TG.id, completeAttempts: 1 });
    expect(String(session.user)).toBe(String(user._id));
    expect(session.otpHash).toBeUndefined();
  });

  it('stays pending after the email link is confirmed: only emailVerified changes', async () => {
    const { cookies, code } = await withCode();
    await verify(cookies, code);
    await complete(cookies, { name: 'Tele User', email: 'persist@inventory.local' });

    const raw = vi.mocked(sendVerificationEmail).mock.calls.at(-1)![2];
    const confirmed = await request(app).get(`/api/auth/verify-email/${raw}`);
    expect(confirmed.status).toBe(200);

    const user = (await User.findOne({ email: 'persist@inventory.local' }))!;
    expect(user).toMatchObject({ status: 'pending', emailVerified: true, role: 'staff', telegramChatId: String(TG.id) });
    expect(user.passwordHash).toBeUndefined();
    expect((await EmailToken.findOne({ user: user._id }))!.consumed).toBe(true);
  });

  it('a later sign in writes nothing to the user, only to the attempt', async () => {
    const user = await User.create({
      name: 'Tele',
      email: 'tele@inventory.local',
      telegramChatId: String(TG.id),
      status: 'pending',
      emailVerified: true,
    });
    const before = JSON.stringify(await User.findById(user._id).lean());
    const { cookies, code } = await withCode();
    expect((await verify(cookies, code)).status).toBe(200);

    expect(JSON.stringify(await User.findById(user._id).lean())).toBe(before);
    const session = (await AuthSession.findOne())!;
    expect(session).toMatchObject({ status: 'COMPLETED', purpose: 'LOGIN' });
    expect(String(session.user)).toBe(String(user._id));
  });

  it('links to an existing password account only after the confirm link, leaving its other data alone', async () => {
    const owner = await User.create({
      name: 'Owner',
      email: 'owner@inventory.local',
      passwordHash: 'bcrypt-hash',
      status: 'active',
      emailVerified: true,
    });
    const { cookies, code } = await withCode();
    await verify(cookies, code);
    await complete(cookies, { name: 'Tele', email: 'owner@inventory.local' });

    // nothing changes before the click, and no second account exists
    let current = (await User.findById(owner._id))!;
    expect(current.telegramChatId).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);
    const token = await EmailToken.findOne({ user: owner._id, type: 'link-telegram' });
    expect(token).toMatchObject({ consumed: false, telegramChatId: String(TG.id) });

    const raw = vi.mocked(sendTelegramLinkEmail).mock.calls.at(-1)![2];
    expect((await request(app).get(`/api/auth/verify-email/${raw}`)).status).toBe(200);

    current = (await User.findById(owner._id))!;
    expect(current).toMatchObject({
      telegramChatId: String(TG.id),
      passwordHash: 'bcrypt-hash',
      status: 'active',
      emailVerified: true,
      email: 'owner@inventory.local',
    });
  });
});
