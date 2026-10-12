import nodemailer from 'nodemailer';
import { Api } from 'grammy';
import { env } from './config/env.js';
import { emailMode, isSmtpConfigured } from './services/email.js';

// Pre-flight for the manual live check (docs/live-check.md): npm run live-check [-- --send-to you@example.com]
// Read-only against Telegram (getMe, getWebhookInfo) and SMTP (a login). Mail is only sent with --send-to.
const PLACEHOLDER_PREFIX = 'your-';
const isSet = (value?: string) => !!value && !value.toLowerCase().startsWith(PLACEHOLDER_PREFIX);

let failed = false;
const report = (ok: boolean, label: string, detail = '') => {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
};

const sendToIndex = process.argv.indexOf('--send-to');
const sendTo = sendToIndex === -1 ? undefined : process.argv[sendToIndex + 1];

const checkTelegram = async () => {
  const token = env.TELEGRAM_BOT_TOKEN;
  report(isSet(token), 'TELEGRAM_BOT_TOKEN is a real token');
  if (!token || !isSet(token)) return;

  try {
    const api = new Api(token);
    const me = await api.getMe();
    report(true, 'Bot token accepted by Telegram', `@${me.username}`);
    report(
      me.username === env.TELEGRAM_BOT_USERNAME,
      'TELEGRAM_BOT_USERNAME matches the token',
      `env=${env.TELEGRAM_BOT_USERNAME ?? 'unset'}, bot=${me.username}`
    );

    const hook = await api.getWebhookInfo();
    // Starting the server in polling mode deletes any webhook, so a set one means another deployment owns this bot.
    report(
      env.TELEGRAM_MODE === 'webhook' || !hook.url,
      'No webhook registered on this token',
      hook.url ? `webhook is ${hook.url}: another deployment uses this bot` : 'polling is safe'
    );
  } catch (err) {
    report(false, 'Telegram API reachable', err instanceof Error ? err.message : 'unknown error');
  }
};

const checkMail = async () => {
  report(isSmtpConfigured(), 'Brevo SMTP credentials are set', `mode=${emailMode()}`);
  if (!isSmtpConfigured()) return;
  report(isSet(env.EMAIL_FROM) && !!env.EMAIL_FROM, 'EMAIL_FROM is set (must be a verified Brevo sender)', env.EMAIL_FROM ?? 'unset');

  const transport = nodemailer.createTransport({
    host: env.BREVO_SMTP_HOST,
    port: env.BREVO_SMTP_PORT,
    secure: env.BREVO_SMTP_PORT === 465,
    auth: { user: env.BREVO_SMTP_USER, pass: env.BREVO_SMTP_PASS },
  });
  try {
    await transport.verify();
    report(true, 'SMTP login accepted', `${env.BREVO_SMTP_HOST}:${env.BREVO_SMTP_PORT}`);
    if (sendTo) {
      await transport.sendMail({
        from: env.EMAIL_FROM,
        to: sendTo,
        subject: 'Inventory live check: test mail',
        text: 'If you can read this, Brevo delivery works.',
      });
      report(true, 'Test mail handed to Brevo', `check the inbox (and spam) of ${sendTo}`);
    }
  } catch (err) {
    report(false, 'SMTP login / send', err instanceof Error ? err.message : 'unknown error');
  }
};

console.log(`NODE_ENV=${env.NODE_ENV}  TELEGRAM_MODE=${env.TELEGRAM_MODE}  CLIENT_URL=${env.CLIENT_URL}\n`);
await checkTelegram();
await checkMail();
console.log(failed ? '\nFix the FAIL lines before starting the live check.' : '\nReady: start the server (only one) and follow docs/live-check.md.');
process.exit(failed ? 1 : 0);
