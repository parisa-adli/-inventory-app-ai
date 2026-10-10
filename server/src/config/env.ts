import './load-env.js';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  COOKIE_DOMAIN: z.string().optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  // Email (Brevo SMTP). Optional on purpose: see services/email.ts for how "not configured" behaves.
  EMAIL_FROM: z.string().optional(),
  BREVO_SMTP_HOST: z.string().default('smtp-relay.brevo.com'),
  BREVO_SMTP_PORT: z.coerce.number().int().positive().default(587),
  BREVO_SMTP_USER: z.string().optional(),
  BREVO_SMTP_PASS: z.string().optional(),
  // Telegram. The token is optional on purpose: see services/telegram.ts for how "not configured" behaves.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/, 'TELEGRAM_BOT_USERNAME must be 5-32 letters, digits or underscores')
    .optional(),
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_URL: z.url().optional(),
});

const PLACEHOLDER_PREFIX = 'your-';
const isPlaceholder = (value?: string) => !value || value.toLowerCase().startsWith(PLACEHOLDER_PREFIX);

// Webhook mode needs a public HTTPS origin and a real secret_token; polling needs neither.
const checkedSchema = envSchema.superRefine((value, ctx) => {
  if (value.TELEGRAM_MODE !== 'webhook') return;
  if (!value.PUBLIC_URL || !value.PUBLIC_URL.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['PUBLIC_URL'],
      message: 'PUBLIC_URL must be a public https:// origin when TELEGRAM_MODE=webhook',
    });
  }
  if (isPlaceholder(value.TELEGRAM_WEBHOOK_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['TELEGRAM_WEBHOOK_SECRET'],
      message: 'TELEGRAM_WEBHOOK_SECRET must be set when TELEGRAM_MODE=webhook',
    });
  }
});

const parsed = checkedSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;
