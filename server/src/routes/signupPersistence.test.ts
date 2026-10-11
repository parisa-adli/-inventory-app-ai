import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import {
  sendPasswordResetEmail,
  sendTelegramLinkEmail,
  sendVerificationEmail,
} from '../services/email.js';
import { signupWithTelegram } from '../services/telegramSignup.js';
import { sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { clearTestDb, connectTestDb, cookieHeader, disconnectTestDb } from '../test/db.js';

/**
 * What is actually stored for an email sign up and a Telegram sign up, and that neither flow
 * overwrites the other's data. These are database assertions, not response assertions.
 */
vi.mock('../services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.js')>()),
  sendVerificationEmail: vi.fn(async () => ({})),
  sendPasswordResetEmail: vi.fn(async () => ({})),
  sendTelegramLinkEmail: vi.fn(async () => ({})),
}));

const app = createApp();
const PASSWORD = 'Str0ng!Passw0rd';
const CHAT = '424242';

const mailDown = () => new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is currently unavailable.');
const lastToken = (mock: typeof sendVerificationEmail) => vi.mocked(mock).mock.calls.at(-1)![2];

const register = (email = 'new@inventory.local') =>
  request(app).post('/api/auth/register').send({ name: 'New Person', email, password: PASSWORD });

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

describe('email sign up: persisted state', () => {
  it('stores a pending, unverified staff user with a password hash and one hashed verify-email token', async () => {
    expect((await register()).status).toBe(201);

    const user = (await User.findOne({ email: 'new@inventory.local' }))!;
    expect(user).toMatchObject({ name: 'New Person', role: 'staff', status: 'pending', emailVerified: false });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    // no Telegram identity, no delivery failure metadata
    expect(user.telegramChatId).toBeUndefined();
    expect(user.lastEmailFailedAt).toBeUndefined();
    expect(user.lastEmailFailedType).toBeUndefined();

    const tokens = await EmailToken.find({ user: user._id });
    expect(tokens).toHaveLength(1);
    const raw = lastToken(sendVerificationEmail);
    expect(tokens[0]).toMatchObject({ type: 'verify-email', consumed: false, tokenHash: sha256(raw) });
    expect(JSON.stringify(tokens[0])).not.toContain(raw);
  });

  it('leaves nothing behind when the verification mail cannot be sent', async () => {
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(mailDown());
    expect((await register()).status).toBe(503);
    expect(await User.countDocuments()).toBe(0);
    expect(await EmailToken.countDocuments()).toBe(0);
  });

  it('keeps the account pending after verification: only emailVerified flips and the token is consumed', async () => {
    await register();
    const before = (await User.findOne({ email: 'new@inventory.local' }).lean())!;
    expect((await request(app).get(`/api/auth/verify-email/${lastToken(sendVerificationEmail)}`)).status).toBe(200);

    const after = (await User.findById(before._id).lean())!;
    expect(after).toMatchObject({ status: 'pending', emailVerified: true, role: 'staff', email: before.email });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.telegramChatId).toBeUndefined();
    expect((await EmailToken.findOne({ user: before._id }))!.consumed).toBe(true);
  });

  it('records a failed resend on the user and clears it after the next successful send', async () => {
    await register();
    const cookies = cookieHeader(
      (await request(app).post('/api/auth/login').send({ email: 'new@inventory.local', password: PASSWORD })).headers[
        'set-cookie'
      ]
    );

    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(mailDown());
    expect((await request(app).post('/api/auth/resend-verification').set('Cookie', cookies)).status).toBe(503);
    let user = (await User.findOne({ email: 'new@inventory.local' }))!;
    expect(user.lastEmailFailedAt).toBeInstanceOf(Date);
    expect(user.lastEmailFailedType).toBe('verify-email');
    expect(user).toMatchObject({ status: 'pending', emailVerified: false });

    expect((await request(app).post('/api/auth/resend-verification').set('Cookie', cookies)).status).toBe(200);
    user = (await User.findOne({ email: 'new@inventory.local' }))!;
    expect(user.lastEmailFailedAt).toBeUndefined();
    expect(user.lastEmailFailedType).toBeUndefined();
  });

  it('change-email stores the new address, stays unverified and replaces the token', async () => {
    await register();
    const cookies = cookieHeader(
      (await request(app).post('/api/auth/login').send({ email: 'new@inventory.local', password: PASSWORD })).headers[
        'set-cookie'
      ]
    );
    const before = (await User.findOne({ email: 'new@inventory.local' }).lean())!;

    const res = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'fixed@inventory.local' });
    expect(res.status).toBe(200);

    const after = (await User.findById(before._id).lean())!;
    expect(after).toMatchObject({ email: 'fixed@inventory.local', emailVerified: false, status: 'pending' });
    expect(after.passwordHash).toBe(before.passwordHash);
    const tokens = await EmailToken.find({ user: before._id, type: 'verify-email' });
    expect(tokens).toHaveLength(1); // the old link was discarded
    expect(tokens[0].tokenHash).toBe(sha256(lastToken(sendVerificationEmail)));
  });
});

describe('Telegram sign up: persisted state', () => {
  const signup = (email = 'tele@inventory.local') => signupWithTelegram({ chatId: CHAT, name: 'Tele Gram', email });

  it('stores a pending, unverified, passwordless staff user with the chat id and one verify-email token', async () => {
    await signup();

    const user = (await User.findOne({ email: 'tele@inventory.local' }))!;
    expect(user).toMatchObject({
      name: 'Tele Gram',
      role: 'staff',
      status: 'pending',
      emailVerified: false,
      telegramChatId: CHAT,
    });
    expect(user.passwordHash).toBeUndefined();
    expect(user.lastEmailFailedAt).toBeUndefined();

    const tokens = await EmailToken.find({ user: user._id });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: 'verify-email', consumed: false });
    expect(tokens[0].telegramChatId).toBeUndefined();
  });

  it('leaves nothing behind when the verification mail cannot be sent', async () => {
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(mailDown());
    await expect(signup()).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE' });
    expect(await User.countDocuments()).toBe(0);
    expect(await EmailToken.countDocuments()).toBe(0);
  });

  it('stays pending after verification and keeps its chat id', async () => {
    await signup();
    expect((await request(app).get(`/api/auth/verify-email/${lastToken(sendVerificationEmail)}`)).status).toBe(200);

    const user = (await User.findOne({ email: 'tele@inventory.local' }))!;
    expect(user).toMatchObject({ status: 'pending', emailVerified: true, telegramChatId: CHAT });
    expect(user.passwordHash).toBeUndefined();
  });

  it('records a failed confirm-link mail on the account owner and clears it after the next successful send', async () => {
    const owner = await User.create({
      name: 'Owner',
      email: 'owner@inventory.local',
      passwordHash: 'bcrypt-hash',
      status: 'active',
      emailVerified: true,
    });

    vi.mocked(sendTelegramLinkEmail).mockRejectedValueOnce(mailDown());
    await expect(signup('owner@inventory.local')).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE' });
    let current = (await User.findById(owner._id))!;
    expect(current.lastEmailFailedAt).toBeInstanceOf(Date);
    expect(current.lastEmailFailedType).toBe('link-telegram');
    expect(await EmailToken.countDocuments({ user: owner._id })).toBe(0); // the unsent link was discarded

    await signup('owner@inventory.local');
    current = (await User.findById(owner._id))!;
    expect(current.lastEmailFailedAt).toBeUndefined();
    expect(current.lastEmailFailedType).toBeUndefined();
    // still nothing linked until the owner clicks
    expect(current.telegramChatId).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);
  });
});

describe('the two flows do not overwrite each other', () => {
  it('a password account that links Telegram keeps its password, status and verification', async () => {
    await register('both@inventory.local');
    await request(app).get(`/api/auth/verify-email/${lastToken(sendVerificationEmail)}`);
    const before = (await User.findOne({ email: 'both@inventory.local' }).lean())!;

    await signupWithTelegram({ chatId: CHAT, name: 'Someone', email: 'both@inventory.local' });
    expect((await User.findById(before._id).lean())!.telegramChatId).toBeUndefined(); // before the click
    expect((await request(app).get(`/api/auth/verify-email/${lastToken(sendTelegramLinkEmail)}`)).status).toBe(200);

    const after = (await User.findById(before._id).lean())!;
    expect(after).toMatchObject({
      telegramChatId: CHAT,
      status: 'pending',
      emailVerified: true,
      name: 'New Person',
    });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await User.countDocuments()).toBe(1);
  });

  it('a Telegram-only account that sets a password keeps its chat id and does not become verified or active', async () => {
    await signupWithTelegram({ chatId: CHAT, name: 'Tele', email: 'tele@inventory.local' });
    const before = (await User.findOne({ email: 'tele@inventory.local' }).lean())!;

    await request(app).post('/api/auth/forgot-password').send({ email: 'tele@inventory.local' });
    await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1));
    const reset = await request(app)
      .post(`/api/auth/reset-password/${lastToken(sendPasswordResetEmail)}`)
      .send({ password: PASSWORD });
    expect(reset.status).toBe(204);

    const after = (await User.findById(before._id).lean())!;
    expect(after.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(after).toMatchObject({ telegramChatId: CHAT, status: 'pending', emailVerified: false });
    // and the new password now works for email sign in
    const login = await request(app).post('/api/auth/login').send({ email: 'tele@inventory.local', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ status: 'pending', emailVerified: false });
  });

  it('an email address change does not touch the Telegram identity', async () => {
    await signupWithTelegram({ chatId: CHAT, name: 'Tele', email: 'tele@inventory.local' });
    const user = (await User.findOne({ email: 'tele@inventory.local' }))!;
    // a Telegram-only account sets a password through a reset, so it can sign in with email as well
    await request(app).post('/api/auth/forgot-password').send({ email: 'tele@inventory.local' });
    await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1));
    await request(app)
      .post(`/api/auth/reset-password/${lastToken(sendPasswordResetEmail)}`)
      .send({ password: PASSWORD });
    const cookies = cookieHeader(
      (await request(app).post('/api/auth/login').send({ email: 'tele@inventory.local', password: PASSWORD })).headers[
        'set-cookie'
      ]
    );

    const res = await request(app).patch('/api/auth/email').set('Cookie', cookies).send({ email: 'typo-fixed@inventory.local' });
    expect(res.status).toBe(200);
    const after = (await User.findById(user._id).lean())!;
    expect(after).toMatchObject({ email: 'typo-fixed@inventory.local', telegramChatId: CHAT, emailVerified: false });
  });
});
