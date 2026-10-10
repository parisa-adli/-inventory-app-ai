import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_TTL_MS,
  MESSAGES,
  handleMessage,
  resetConversations,
} from './telegramConversation.js';
import { approveTelegramLogin } from './telegramLogin.js';
import { signupWithTelegram } from './telegramSignup.js';

vi.mock('./telegramSignup.js', () => ({ signupWithTelegram: vi.fn() }));
vi.mock('./telegramLogin.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./telegramLogin.js')>()),
  approveTelegramLogin: vi.fn(),
}));

const CHAT = '555';

beforeEach(() => {
  resetConversations();
  vi.mocked(signupWithTelegram).mockReset().mockResolvedValue('created');
  vi.mocked(approveTelegramLogin).mockReset().mockResolvedValue('approved');
});

describe('telegram QR login payload', () => {
  it('approves the login with the token after the prefix and confirms in the chat', async () => {
    expect(await handleMessage(CHAT, '/start login_abc123')).toBe(MESSAGES.loginApproved);
    expect(approveTelegramLogin).toHaveBeenCalledWith('abc123', CHAT);
    expect(signupWithTelegram).not.toHaveBeenCalled();
  });

  it('maps unlinked and expired outcomes to their replies', async () => {
    vi.mocked(approveTelegramLogin).mockResolvedValueOnce('unlinked');
    expect(await handleMessage(CHAT, '/start login_abc')).toBe(MESSAGES.loginUnlinked);
    vi.mocked(approveTelegramLogin).mockResolvedValueOnce('expired');
    expect(await handleMessage(CHAT, '/start login_abc')).toBe(MESSAGES.loginExpired);
  });

  it('does not start the signup dialogue and drops one that was in progress', async () => {
    await handleMessage(CHAT, '/start');
    await handleMessage(CHAT, '/start login_abc');
    expect(await handleMessage(CHAT, 'Ada')).toBe(MESSAGES.idle);
  });

  it('tells the user to retry when approving throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(approveTelegramLogin).mockRejectedValueOnce(new Error('db down'));
    expect(await handleMessage(CHAT, '/start login_abc')).toBe(MESSAGES.failed);
  });
});

describe('telegram signup conversation', () => {
  it('walks start -> name -> email and signs up with the collected values', async () => {
    expect(await handleMessage(CHAT, '/start')).toBe(MESSAGES.askName);
    expect(await handleMessage(CHAT, '  Ada Lovelace ')).toBe(MESSAGES.askEmail);
    expect(await handleMessage(CHAT, ' Ada@Example.COM ')).toBe(MESSAGES.created);

    expect(signupWithTelegram).toHaveBeenCalledWith({
      chatId: CHAT,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });

  it('accepts the deep-link payload and the @botname command form', async () => {
    expect(await handleMessage(CHAT, '/start signup')).toBe(MESSAGES.askName);
    expect(await handleMessage('556', '/start@inventory_bot')).toBe(MESSAGES.askName);
  });

  it('re-asks while the name or email is invalid', async () => {
    await handleMessage(CHAT, '/start');
    expect(await handleMessage(CHAT, 'x'.repeat(101))).toBe(MESSAGES.invalidName);
    await handleMessage(CHAT, 'Ada');
    expect(await handleMessage(CHAT, 'not-an-email')).toBe(MESSAGES.invalidEmail);
    expect(signupWithTelegram).not.toHaveBeenCalled();

    expect(await handleMessage(CHAT, 'ada@example.com')).toBe(MESSAGES.created);
  });

  it('points anyone outside a dialogue to /start', async () => {
    expect(await handleMessage(CHAT, 'hello')).toBe(MESSAGES.idle);
  });

  it('/cancel ends the dialogue, and /start begins again', async () => {
    await handleMessage(CHAT, '/start');
    expect(await handleMessage(CHAT, '/cancel')).toBe(MESSAGES.cancelled);
    expect(await handleMessage(CHAT, 'Ada')).toBe(MESSAGES.idle);
    expect(await handleMessage(CHAT, '/cancel')).toBe(MESSAGES.nothingToCancel);
  });

  it('/start mid-dialogue restarts from the name step', async () => {
    await handleMessage(CHAT, '/start');
    await handleMessage(CHAT, 'Ada');
    expect(await handleMessage(CHAT, '/start')).toBe(MESSAGES.askName);
  });

  it('forgets a dialogue after the timeout', async () => {
    const t0 = 1_000_000;
    await handleMessage(CHAT, '/start', t0);
    expect(await handleMessage(CHAT, 'Ada', t0 + CONVERSATION_TTL_MS + 1)).toBe(MESSAGES.idle);
  });

  it('keeps chats independent', async () => {
    await handleMessage('a', '/start');
    expect(await handleMessage('b', 'Ada')).toBe(MESSAGES.idle);
  });

  it('maps every signup outcome to its reply', async () => {
    for (const [outcome, message] of [
      ['created', MESSAGES.created],
      ['link-sent', MESSAGES.linkSent],
      ['already-linked', MESSAGES.alreadyLinked],
    ] as const) {
      vi.mocked(signupWithTelegram).mockResolvedValueOnce(outcome);
      await handleMessage(CHAT, '/start');
      await handleMessage(CHAT, 'Ada');
      expect(await handleMessage(CHAT, 'ada@example.com')).toBe(message);
    }
  });

  it('tells the user to retry later when signup fails, and ends the dialogue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(signupWithTelegram).mockRejectedValueOnce(new Error('mail down'));
    await handleMessage(CHAT, '/start');
    await handleMessage(CHAT, 'Ada');
    expect(await handleMessage(CHAT, 'ada@example.com')).toBe(MESSAGES.failed);
    expect(await handleMessage(CHAT, 'ada@example.com')).toBe(MESSAGES.idle);
  });
});
