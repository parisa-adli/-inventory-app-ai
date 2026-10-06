import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const PLACEHOLDER_PREFIX = 'your-';
const DEFAULT_FROM = 'Inventory Manager <no-reply@inventory.local>';

type EmailMode = 'smtp' | 'log' | 'unavailable';

const isSet = (value?: string): value is string =>
  !!value && !value.toLowerCase().startsWith(PLACEHOLDER_PREFIX);

export const isSmtpConfigured = (): boolean => isSet(env.BREVO_SMTP_USER) && isSet(env.BREVO_SMTP_PASS);

/**
 * smtp: send through Brevo. log: dev/test fallback that prints the link to the console.
 * unavailable: production without SMTP; links/tokens must never be logged there.
 */
export const emailMode = (): EmailMode => {
  if (isSmtpConfigured()) return 'smtp';
  return env.NODE_ENV === 'production' ? 'unavailable' : 'log';
};

const unavailableError = () =>
  new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is currently unavailable. Please try again later.');

/**
 * Call before touching the DB in any route that sends mail, so an unconfigured production
 * server answers every request identically (no account enumeration through the failure).
 */
export const assertEmailAvailable = (): void => {
  if (emailMode() === 'unavailable') throw unavailableError();
};

let transporter: Transporter | undefined;
const getTransporter = (): Transporter => {
  transporter ??= nodemailer.createTransport({
    host: env.BREVO_SMTP_HOST,
    port: env.BREVO_SMTP_PORT,
    secure: env.BREVO_SMTP_PORT === 465,
    auth: { user: env.BREVO_SMTP_USER, pass: env.BREVO_SMTP_PASS },
  });
  return transporter;
};

interface Message {
  to: string;
  subject: string;
  intro: string;
  linkLabel: string;
  link: string;
  outro: string;
}

const deliver = async (message: Message): Promise<void> => {
  const mode = emailMode();
  if (mode === 'unavailable') throw unavailableError();

  if (mode === 'log') {
    console.log(`[email:dev] SMTP not configured. "${message.subject}" for ${message.to}: ${message.link}`);
    return;
  }

  const text = `${message.intro}\n\n${message.linkLabel}: ${message.link}\n\n${message.outro}`;
  const html =
    `<p>${message.intro}</p>` +
    `<p><a href="${message.link}">${message.linkLabel}</a></p>` +
    `<p>${message.outro}</p>`;

  try {
    await getTransporter().sendMail({
      from: env.EMAIL_FROM ?? DEFAULT_FROM,
      to: message.to,
      subject: message.subject,
      text,
      html,
    });
  } catch (err) {
    // Never log the message itself: it contains the token link.
    console.error('Email delivery failed:', err instanceof Error ? err.message : 'unknown error');
    throw unavailableError();
  }
};

export const verificationLink = (token: string): string => `${env.CLIENT_URL}/verify-email/${token}`;
export const resetLink = (token: string): string => `${env.CLIENT_URL}/reset-password/${token}`;

export const sendVerificationEmail = (to: string, name: string, token: string): Promise<void> =>
  deliver({
    to,
    subject: 'Verify your email address',
    intro: `Hi ${name}, confirm your email address to finish setting up your Inventory Manager account.`,
    linkLabel: 'Verify email',
    link: verificationLink(token),
    outro: 'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
  });

export const sendPasswordResetEmail = (to: string, name: string, token: string): Promise<void> =>
  deliver({
    to,
    subject: 'Reset your password',
    intro: `Hi ${name}, we received a request to reset your Inventory Manager password.`,
    linkLabel: 'Reset password',
    link: resetLink(token),
    outro: 'This link expires in 1 hour. If you did not request this, you can ignore this email.',
  });
