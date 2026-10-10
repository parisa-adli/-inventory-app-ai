import { registerSchema } from '@inventory/shared';
import { LOGIN_START_PREFIX, approveTelegramLogin, type ApproveOutcome } from './telegramLogin.js';
import { signupWithTelegram, type TelegramSignupOutcome } from './telegramSignup.js';

/** Conversations older than this are forgotten, so an abandoned signup does not linger. */
export const CONVERSATION_TTL_MS = 10 * 60_000;

type Step = { step: 'name'; at: number } | { step: 'email'; at: number; name: string };

const conversations = new Map<string, Step>();

const nameRule = registerSchema.shape.name;
const emailRule = registerSchema.shape.email;

export const MESSAGES = {
  askName: 'Welcome to Inventory Manager! Let\'s create your account. What is your full name?',
  askEmail: 'Thanks! Now send the email address you want to use for your account.',
  invalidName: 'That does not look like a valid name. Please send your full name (up to 100 characters).',
  invalidEmail: 'That does not look like a valid email address. Please send it again.',
  idle: 'Send /start to sign up.',
  cancelled: 'Signup cancelled. Send /start to begin again.',
  nothingToCancel: 'There is nothing to cancel. Send /start to sign up.',
  created:
    'Almost done! We sent a verification link to your email. After you verify it, an administrator will approve your account. Then you can sign in by scanning a QR code on the website.',
  linkSent:
    'That email is already registered. We sent a confirmation link to it. Open the link to connect this Telegram chat to the account, then you can sign in by scanning a QR code on the website.',
  alreadyLinked:
    'This Telegram account is already linked to an account. Open the app and choose "Telegram" on the sign in page to scan a login QR code.',
  loginApproved: 'You are signed in. Go back to your browser to continue.',
  loginUnlinked:
    'This Telegram account is not linked to an account yet. Send /start to sign up, or sign in with your email and password first.',
  loginExpired: 'That login QR code has expired. Go back to the website and press "Start over".',
  failed: 'Sorry, we could not complete your signup right now. Please try again later with /start.',
} as const;

const OUTCOME_MESSAGE: Record<TelegramSignupOutcome, string> = {
  created: MESSAGES.created,
  'link-sent': MESSAGES.linkSent,
  'already-linked': MESSAGES.alreadyLinked,
};

const LOGIN_MESSAGE: Record<ApproveOutcome, string> = {
  approved: MESSAGES.loginApproved,
  unlinked: MESSAGES.loginUnlinked,
  expired: MESSAGES.loginExpired,
};

export const resetConversations = (): void => conversations.clear();

const live = (chatId: string, now: number): Step | undefined => {
  const current = conversations.get(chatId);
  if (current && now - current.at > CONVERSATION_TTL_MS) {
    conversations.delete(chatId);
    return undefined;
  }
  return current;
};

/**
 * The signup dialogue as a pure state machine: text in, reply text out. The grammY wiring in
 * services/telegram.ts is only plumbing, so this is testable without a bot.
 */
export const handleMessage = async (chatId: string, text: string, now = Date.now()): Promise<string> => {
  const input = text.trim();
  const command = input.split(/\s+/)[0]?.split('@')[0]?.toLowerCase();

  if (command === '/cancel') {
    const had = live(chatId, now);
    conversations.delete(chatId);
    return had ? MESSAGES.cancelled : MESSAGES.nothingToCancel;
  }

  // "/start login_<token>" comes from the QR code on the sign in page
  const payload = input.split(/\s+/)[1];
  if (command === '/start' && payload?.startsWith(LOGIN_START_PREFIX)) {
    conversations.delete(chatId);
    try {
      const outcome = await approveTelegramLogin(payload.slice(LOGIN_START_PREFIX.length), chatId);
      return LOGIN_MESSAGE[outcome];
    } catch (err) {
      console.error('Telegram login failed:', err instanceof Error ? err.message : 'unknown error');
      return MESSAGES.failed;
    }
  }

  // "/start" and "/start signup" (the deep-link payload) both begin, or restart, the dialogue
  if (command === '/start') {
    conversations.set(chatId, { step: 'name', at: now });
    return MESSAGES.askName;
  }

  const current = live(chatId, now);
  if (!current) return MESSAGES.idle;

  if (current.step === 'name') {
    const name = nameRule.safeParse(input);
    if (!name.success) return MESSAGES.invalidName;
    conversations.set(chatId, { step: 'email', at: now, name: name.data });
    return MESSAGES.askEmail;
  }

  const email = emailRule.safeParse(input);
  if (!email.success) return MESSAGES.invalidEmail;

  conversations.delete(chatId);
  try {
    const outcome = await signupWithTelegram({ chatId, name: current.name, email: email.data });
    return OUTCOME_MESSAGE[outcome];
  } catch (err) {
    console.error('Telegram signup failed:', err instanceof Error ? err.message : 'unknown error');
    return MESSAGES.failed;
  }
};
