import type { RequestHandler } from 'express';
import { Bot, webhookCallback } from 'grammy';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { MESSAGES, startFromBot } from './telegramAuth.js';

export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';

const PLACEHOLDER_PREFIX = 'your-';

type TelegramMode = 'bot' | 'log' | 'unavailable';

export const isTelegramConfigured = (): boolean =>
  !!env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_BOT_TOKEN.toLowerCase().startsWith(PLACEHOLDER_PREFIX);

/**
 * bot: talk to Telegram. log: dev/test fallback where no bot runs (codes are printed, tests call the services directly).
 * unavailable: production without a token.
 */
export const telegramMode = (): TelegramMode => {
  if (isTelegramConfigured()) return 'bot';
  return env.NODE_ENV === 'production' ? 'unavailable' : 'log';
};

const unavailableError = () =>
  new AppError(503, 'TELEGRAM_UNAVAILABLE', 'Telegram login is currently unavailable. Please try again later.');

/** Call before touching the DB in the Telegram auth routes, so every request fails the same way. */
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
  // Private chats only: the code is personal
  instance.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) return;
    const nonce = ctx.match.trim();
    if (!nonce) {
      await ctx.reply(MESSAGES.welcome);
      return;
    }
    const reply = await startFromBot(nonce, {
      id: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
    });
    await ctx.reply(reply);
  });

  instance.on('message:text', async (ctx) => {
    if (ctx.chat.type === 'private') await ctx.reply(MESSAGES.welcome);
  });

  instance.catch((err) => {
    // Never log the update itself: it contains the user's name
    console.error('Telegram bot error:', err.error instanceof Error ? err.error.message : 'unknown error');
  });
};

/**
 * Sends a message to a Telegram account (used for resent codes). Without a bot (dev/test) nothing leaves
 * the machine and the text is printed instead; in production without a bot the routes already answered 503.
 */
export const sendTelegramMessage = async (telegramId: number, text: string): Promise<void> => {
  if (telegramMode() === 'bot') {
    await getBot().api.sendMessage(telegramId, text);
    return;
  }
  if (env.NODE_ENV !== 'test') console.log(`🤖 [dev, no bot] message to Telegram ${telegramId}: ${text}`);
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
    console.log('🤖 Telegram bot not started (no token); Telegram sign in cannot be completed');
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
