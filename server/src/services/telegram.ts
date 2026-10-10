import type { RequestHandler } from 'express';
import { Bot, webhookCallback } from 'grammy';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { handleMessage } from './telegramConversation.js';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';

const PLACEHOLDER_PREFIX = 'your-';

type TelegramMode = 'bot' | 'log' | 'unavailable';

export const isTelegramConfigured = (): boolean =>
  !!env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_BOT_TOKEN.toLowerCase().startsWith(PLACEHOLDER_PREFIX);

/**
 * bot: talk to Telegram. log: dev/test fallback where no bot runs (QR logins can only be approved by tests).
 * unavailable: production without a token.
 */
export const telegramMode = (): TelegramMode => {
  if (isTelegramConfigured()) return 'bot';
  return env.NODE_ENV === 'production' ? 'unavailable' : 'log';
};

const unavailableError = () =>
  new AppError(503, 'TELEGRAM_UNAVAILABLE', 'Telegram login is currently unavailable. Please try again later.');

/** Call before touching the DB in the QR login routes, so every request fails the same way. */
export const assertTelegramAvailable = (): void => {
  if (telegramMode() === 'unavailable') throw unavailableError();
};

let bot: Bot | undefined;

const getBot = (): Bot => {
  if (!bot) {
    bot = new Bot(env.TELEGRAM_BOT_TOKEN!);
    registerHandlers(bot);
  }
  return bot;
};

const registerHandlers = (instance: Bot): void => {
  // Private chats only: the dialogue asks for personal details
  instance.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const reply = await handleMessage(String(ctx.chat.id), ctx.message.text);
    await ctx.reply(reply);
  });

  instance.catch((err) => {
    // Never log the update itself: it contains the user's name and email
    console.error('Telegram bot error:', err.error instanceof Error ? err.error.message : 'unknown error');
  });
};

/** `https://t.me/<bot>?start=<payload>`: what the QR code and the "Open Telegram" button point to. */
export const telegramDeepLink = (payload: string): string => {
  if (!env.TELEGRAM_BOT_USERNAME) throw unavailableError();
  return `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${payload}`;
};

/** Express handler for webhook mode (mounted at TELEGRAM_WEBHOOK_PATH). */
export const telegramWebhookHandler = (): RequestHandler =>
  webhookCallback(getBot(), 'express', { secretToken: env.TELEGRAM_WEBHOOK_SECRET });

/**
 * Starts receiving updates. Called from index.ts, never from createApp(), so tests never start a bot.
 * Returns a function that stops it.
 */
export const startTelegramBot = async (): Promise<() => Promise<void>> => {
  if (telegramMode() !== 'bot') {
    console.log('🤖 Telegram bot not started (no token); QR login cannot be approved from Telegram');
    return async () => {};
  }

  const instance = getBot();

  if (env.TELEGRAM_MODE === 'webhook') {
    await instance.api.setWebhook(`${env.PUBLIC_URL}${TELEGRAM_WEBHOOK_PATH}`, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    });
    console.log('🤖 Telegram bot: webhook mode');
    return async () => {};
  }

  // Polling and webhook are mutually exclusive on Telegram's side
  await instance.api.deleteWebhook();
  instance
    .start({ onStart: (me) => console.log(`🤖 Telegram bot @${me.username}: polling`) })
    .catch((err) => {
      console.error('Telegram polling stopped:', err instanceof Error ? err.message : 'unknown error');
    });
  return () => instance.stop();
};
