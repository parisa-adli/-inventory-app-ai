import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import { signupWithTelegram } from '../services/telegramSignup.js';
import { sendTelegramLinkEmail } from '../services/email.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../test/db.js';

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
