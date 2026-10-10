import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TelegramLogin } from '../models/TelegramLogin.js';
import { User } from '../models/User.js';
import { sha256 } from '../utils/crypto.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../test/db.js';
import {
  LOGIN_START_PREFIX,
  TELEGRAM_LOGIN_TTL_MS,
  approveTelegramLogin,
  createTelegramLogin,
  pollTelegramLogin,
} from './telegramLogin.js';

const CHAT = '8001';

const makeLinkedUser = () =>
  User.create({ name: 'Tele User', email: 'tele@inventory.local', telegramChatId: CHAT, status: 'active' });

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('createTelegramLogin', () => {
  it('stores only hashes of two different secrets and a 5 minute expiry', async () => {
    const { startToken, pollToken, expiresAt } = await createTelegramLogin();
    expect(startToken).not.toBe(pollToken);

    const stored = (await TelegramLogin.findOne())!;
    expect(stored).toMatchObject({ startHash: sha256(startToken), pollHash: sha256(pollToken), status: 'pending' });
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(TELEGRAM_LOGIN_TTL_MS);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(TELEGRAM_LOGIN_TTL_MS - 5_000);
  });

  it('keeps the whole /start payload within Telegram\'s 64 character limit', async () => {
    const { startToken } = await createTelegramLogin();
    expect(`${LOGIN_START_PREFIX}${startToken}`.length).toBeLessThanOrEqual(64);
    expect(`${LOGIN_START_PREFIX}${startToken}`).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('approve + poll', () => {
  it('is pending until the phone approves, then hands the user out exactly once', async () => {
    const user = await makeLinkedUser();
    const { startToken, pollToken } = await createTelegramLogin();

    expect(await pollTelegramLogin(pollToken)).toEqual({ status: 'pending' });
    expect(await approveTelegramLogin(startToken, CHAT)).toBe('approved');

    expect(await pollTelegramLogin(pollToken)).toEqual({ status: 'approved', userId: String(user._id) });
    expect(await pollTelegramLogin(pollToken)).toEqual({ status: 'expired' }); // single use
  });

  it('cannot be collected with the start token (only the browser\'s poll token works)', async () => {
    await makeLinkedUser();
    const { startToken } = await createTelegramLogin();
    await approveTelegramLogin(startToken, CHAT);

    expect(await pollTelegramLogin(startToken)).toEqual({ status: 'expired' });
  });

  it('reports a chat with no linked account as unlinked, without attaching any user', async () => {
    const { startToken, pollToken } = await createTelegramLogin();

    expect(await approveTelegramLogin(startToken, 'unknown-chat')).toBe('unlinked');
    expect(await pollTelegramLogin(pollToken)).toEqual({ status: 'unlinked' });
    expect((await TelegramLogin.findOne())!.user).toBeUndefined();
  });

  it('approves a code only once: a replayed Start from another chat changes nothing', async () => {
    const first = await makeLinkedUser();
    await User.create({ name: 'Other', email: 'other@inventory.local', telegramChatId: '8002' });
    const { startToken, pollToken } = await createTelegramLogin();

    expect(await approveTelegramLogin(startToken, CHAT)).toBe('approved');
    expect(await approveTelegramLogin(startToken, '8002')).toBe('expired');
    expect(await pollTelegramLogin(pollToken)).toEqual({ status: 'approved', userId: String(first._id) });
  });

  it('rejects unknown and expired codes the same way', async () => {
    await makeLinkedUser();
    const { startToken, pollToken } = await createTelegramLogin();
    await TelegramLogin.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    expect(await approveTelegramLogin(startToken, CHAT)).toBe('expired');
    expect(await approveTelegramLogin('nope', CHAT)).toBe('expired');
    expect(await pollTelegramLogin(pollToken)).toEqual({ status: 'expired' });
    expect(await pollTelegramLogin('nope')).toEqual({ status: 'expired' });
  });
});
