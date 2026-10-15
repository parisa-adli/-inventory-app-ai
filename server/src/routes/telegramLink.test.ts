import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { AuthSession } from '../models/AuthSession.js';
import { User } from '../models/User.js';
import { sendTelegramMessage } from '../services/telegram.js';
import { MESSAGES, startFromBot } from '../services/telegramAuth.js';
import { hashPassword } from '../services/password.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

// Linking Telegram from the Profile page (CONTRACT-CHANGES C13): the signed-in user starts a LINK attempt,
// scans the QR code, presses Start in the bot and enters the code. The same /status, /resend and /verify
// routes as sign in serve it; verify links the chat to the caller and issues no new session.

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
const PASSWORD = 'Str0ng!Passw0rd';
const TG = { id: 777001, username: 'linked_handle', firstName: 'Linked', lastName: 'Person' };

let counter = 0;
const makeUser = async (fields: object = {}) =>
  User.create({
    name: 'Profile User',
    email: `link${++counter}@inventory.local`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'staff',
    status: 'active',
    emailVerified: true,
    ...fields,
  });

/** Signs the user in for real, so the browser holds access + refresh cookies. */
const signIn = async (email: string) =>
  cookieHeader((await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).headers['set-cookie']);

const setCookies = (res: { headers: Record<string, unknown> }): string[] => [res.headers['set-cookie'] ?? []].flat() as string[];
const codeFrom = (message: string) => message.match(/\b(\d{6})\b/)![1];
const nonceOf = (deepLink: string) => new URL(deepLink).searchParams.get('start')!;
const tgCookie = (res: { headers: Record<string, unknown> }) => cookieHeader(res.headers['set-cookie'] as string[]);

/** Browser: "Link Telegram" on the Profile page. Returns the Telegram attempt cookie and the nonce. */
const startLink = async (session: string[]) => {
  const res = await request(app).post('/api/auth/telegram/link').set('Cookie', session);
  return { res, tg: res.status === 201 ? tgCookie(res) : [], nonce: res.status === 201 ? nonceOf(res.body.deepLink) : '' };
};
const verify = (cookies: string[], code: string) =>
  request(app).post('/api/auth/telegram/verify').set('Cookie', cookies).send({ code });

/** A signed-in user who started a link and got a code from the bot. */
const linkWithCode = async (from = TG) => {
  const user = await makeUser();
  const session = await signIn(user.email);
  const { tg, nonce } = await startLink(session);
  const reply = await startFromBot(nonce, from);
  return { user, session, tg, reply, code: codeFrom(reply) };
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

describe('POST /api/auth/telegram/link', () => {
  it('starts a LINK attempt bound to the caller: deep link + attempt cookie', async () => {
    const user = await makeUser();
    const { res, tg } = await startLink(await signIn(user.email));

    expect(res.status).toBe(201);
    expect(res.body.deepLink).toMatch(/^https:\/\/t\.me\/\w+\?start=[0-9a-f]{48}$/);
    expect(tg[0]).toMatch(/^tg_auth_session=/);
    const attempt = (await AuthSession.findOne())!;
    expect(attempt.purpose).toBe('LINK');
    expect(String(attempt.user)).toBe(String(user._id));
  });

  it('is 409 TELEGRAM_ALREADY_LINKED when the caller already has a Telegram account', async () => {
    const user = await makeUser({ telegramChatId: '1' });
    const { res } = await startLink(await signIn(user.email));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TELEGRAM_ALREADY_LINKED');
    expect(await AuthSession.countDocuments()).toBe(0);
  });

  it('needs a signed-in, active account', async () => {
    expect((await request(app).post('/api/auth/telegram/link')).status).toBe(401);
    const pending = await makeUser({ status: 'pending' });
    expect((await startLink(await signIn(pending.email))).res.status).toBe(403);
  });

  it('the bot says the code is for linking, also when it is resent', async () => {
    const { tg, reply } = await linkWithCode();
    expect(reply).toBe(MESSAGES.linkCode(codeFrom(reply)));

    await AuthSession.updateOne({}, { lastSentAt: new Date(Date.now() - 61_000) });
    await request(app).post('/api/auth/telegram/resend').set('Cookie', tg).expect(200);
    const sent = vi.mocked(sendTelegramMessage).mock.calls[0][1];
    expect(sent).toBe(MESSAGES.linkCode(codeFrom(sent)));
  });
});

describe('POST /api/auth/telegram/verify on a LINK attempt', () => {
  it('links the chat to the caller and keeps their session (no new cookies)', async () => {
    const { user, session, tg, code } = await linkWithCode();

    const res = await verify([...session, ...tg], code);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'COMPLETED',
      user: expect.objectContaining({ id: String(user._id), telegramLinked: true, telegramUsername: 'linked_handle' }),
    });
    expect(setCookies(res).some((c) => /^(access|refresh)_token=/.test(c))).toBe(false);
    expect(setCookies(res).some((c) => c.startsWith('tg_auth_session=;'))).toBe(true);
    expect((await User.findById(user._id))?.telegramChatId).toBe(String(TG.id));
    // The linked account now signs in with Telegram
    const me = await request(app).get('/api/auth/me').set('Cookie', session);
    expect(me.body.telegramLinked).toBe(true);
  });

  it('answers 401 without spending the code when the access cookie is missing (the client refreshes and retries)', async () => {
    const { user, session, tg, code } = await linkWithCode();

    const noSession = await verify(tg, code);
    expect(noSession.status).toBe(401);

    const retried = await verify([...session, ...tg], code);
    expect(retried.status).toBe(200);
    expect((await User.findById(user._id))?.telegramChatId).toBe(String(TG.id));
  });

  it('answers 401 for a session that has been signed out everywhere', async () => {
    const { session, tg, code } = await linkWithCode();
    await request(app).delete('/api/auth/sessions').set('Cookie', session).expect(204);

    expect((await verify([...session, ...tg], code)).status).toBe(401);
  });

  it('refuses another signed-in user (403) and ends the attempt', async () => {
    const { user, tg, code } = await linkWithCode();
    const other = await makeUser();

    const res = await verify([...(await signIn(other.email)), ...tg], code);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await AuthSession.findOne())?.status).toBe('EXPIRED');
    expect((await User.findById(user._id))?.telegramChatId).toBeUndefined();
    expect((await User.findById(other._id))?.telegramChatId).toBeUndefined();
  });

  it('refuses a caller who was rejected or put on a temporary password after starting the link', async () => {
    for (const change of [{ status: 'rejected' }, { mustChangePassword: true }]) {
      await clearTestDb();
      const { user, session, tg, code } = await linkWithCode();
      await User.updateOne({ _id: user._id }, change);

      const res = await verify([...session, ...tg], code);

      expect(res.status).toBe(403);
      expect((await User.findById(user._id))?.telegramChatId).toBeUndefined();
    }
  });

  it('is 409 TELEGRAM_IN_USE when the Telegram account belongs to someone else', async () => {
    const owner = await makeUser({ telegramChatId: String(TG.id) });
    const { user, session, tg, code } = await linkWithCode();

    const res = await verify([...session, ...tg], code);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TELEGRAM_IN_USE');
    expect((await User.findById(user._id))?.telegramChatId).toBeUndefined();
    expect((await User.findById(owner._id))?.telegramChatId).toBe(String(TG.id));
    // The attempt is over
    expect((await verify([...session, ...tg], code)).status).not.toBe(200);
  });

  it('is 409 TELEGRAM_IN_USE when the caller linked another chat meanwhile', async () => {
    const { user, session, tg, code } = await linkWithCode();
    await User.updateOne({ _id: user._id }, { telegramChatId: '31337' });

    const res = await verify([...session, ...tg], code);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TELEGRAM_IN_USE');
    expect((await User.findById(user._id))?.telegramChatId).toBe('31337');
  });

  it('a wrong code is counted like in sign in', async () => {
    const { session, tg, code } = await linkWithCode();
    const res = await verify([...session, ...tg], code === '000000' ? '111111' : '000000');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OTP');
  });
});

describe('Telegram username is kept current', () => {
  it('a Telegram sign in refreshes the stored @handle', async () => {
    const user = await makeUser({ telegramChatId: String(TG.id), telegramUsername: 'old_handle' });
    const start = await request(app).post('/api/auth/telegram/start');
    const code = codeFrom(await startFromBot(nonceOf(start.body.deepLink), TG));

    const res = await verify(tgCookie(start), code);

    expect(res.status).toBe(200);
    expect(res.body.user.telegramUsername).toBe('linked_handle');
    expect((await User.findById(user._id))?.telegramUsername).toBe('linked_handle');
  });

  it('a Telegram signup stores the @handle', async () => {
    const start = await request(app).post('/api/auth/telegram/start');
    const cookies = tgCookie(start);
    const code = codeFrom(await startFromBot(nonceOf(start.body.deepLink), TG));
    await verify(cookies, code).expect(200);

    const res = await request(app)
      .post('/api/auth/telegram/complete')
      .set('Cookie', cookies)
      .send({ name: 'New Person', email: 'new-tele@inventory.local' });

    expect(res.status).toBe(201);
    expect(res.body.user.telegramUsername).toBe('linked_handle');
  });
});
