import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import { sha256 } from '../utils/crypto.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../test/db.js';
import { sendTelegramLinkEmail, sendVerificationEmail } from './email.js';
import { signupWithTelegram } from './telegramSignup.js';

vi.mock('./email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./email.js')>()),
  sendVerificationEmail: vi.fn(async () => {}),
  sendTelegramLinkEmail: vi.fn(async () => {}),
}));

const lastToken = (mock: typeof sendVerificationEmail) => {
  const calls = vi.mocked(mock).mock.calls;
  return calls[calls.length - 1][2];
};

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  vi.clearAllMocks();
});

describe('signupWithTelegram', () => {
  it('outcome 1: a new email creates a pending, unverified, passwordless staff user and mails a verify link', async () => {
    const { outcome } = await signupWithTelegram({ chatId: '111', name: 'Tele Gram', email: 'tele@inventory.local' });
    expect(outcome).toBe('created');

    const user = (await User.findOne({ email: 'tele@inventory.local' }))!;
    expect(user).toMatchObject({
      status: 'pending',
      role: 'staff',
      emailVerified: false,
      telegramChatId: '111',
    });
    expect(user.passwordHash).toBeUndefined();

    const raw = lastToken(sendVerificationEmail);
    expect(await EmailToken.findOne({ user: user._id })).toMatchObject({
      type: 'verify-email',
      tokenHash: sha256(raw),
    });
  });

  it('outcome 1: leaves nothing behind when the email cannot be sent', async () => {
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(new Error('down'));
    await expect(
      signupWithTelegram({ chatId: '111', name: 'Tele', email: 'tele@inventory.local' })
    ).rejects.toThrow('down');

    expect(await User.countDocuments()).toBe(0);
    expect(await EmailToken.countDocuments()).toBe(0);
  });

  it('outcome 2: an existing email gets a confirm link carrying the chat id and changes nothing yet', async () => {
    await User.create({ name: 'Existing', email: 'existing@inventory.local', passwordHash: 'x' });

    const { outcome } = await signupWithTelegram({ chatId: '222', name: 'Other', email: 'existing@inventory.local' });
    expect(outcome).toBe('link-sent');
    expect(await User.countDocuments()).toBe(1);

    const user = (await User.findOne({ email: 'existing@inventory.local' }))!;
    expect(user.telegramChatId).toBeUndefined();
    expect(user.name).toBe('Existing');

    const raw = lastToken(sendTelegramLinkEmail);
    expect(await EmailToken.findOne({ user: user._id })).toMatchObject({
      type: 'link-telegram',
      telegramChatId: '222',
      tokenHash: sha256(raw),
      consumed: false,
    });
  });

  it('outcome 2: a repeated attempt leaves only the newest confirm link', async () => {
    await User.create({ name: 'Existing', email: 'existing@inventory.local', passwordHash: 'x' });
    await signupWithTelegram({ chatId: '222', name: 'A', email: 'existing@inventory.local' });
    await signupWithTelegram({ chatId: '333', name: 'A', email: 'existing@inventory.local' });

    const tokens = await EmailToken.find({ type: 'link-telegram' });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].telegramChatId).toBe('333');
  });

  it('outcome 3: a chat that is already linked creates nothing and sends nothing', async () => {
    await User.create({ name: 'Linked', email: 'linked@inventory.local', telegramChatId: '444' });

    const { outcome } = await signupWithTelegram({ chatId: '444', name: 'New', email: 'brand-new@inventory.local' });
    expect(outcome).toBe('already-linked');
    expect(await User.countDocuments()).toBe(1);
    expect(await EmailToken.countDocuments()).toBe(0);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(sendTelegramLinkEmail).not.toHaveBeenCalled();
  });
});
