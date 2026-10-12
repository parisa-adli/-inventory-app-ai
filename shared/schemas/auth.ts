import { z } from 'zod';
import { ACCOUNT_STATUS } from '../constants/account-status';
import { USER_ROLES } from '../constants/roles';
import type { AuthUser, ChangeEmailResponse } from '../types/auth';

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt ignores every byte after the 72nd, so longer passwords would be silently truncated. */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a digit.`;

// Normalize first, then validate (Zod 4: z.email() replaces the deprecated z.string().email())
const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

/** New passwords only (register, reset). Login deliberately accepts any non-empty password. */
export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a digit')
  .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES, {
    error: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

/** The 6-digit code the bot sent (digits only; length is part of the contract). */
export const telegramVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

/** Last step of Telegram sign up: the verified Telegram account still needs a username and an email. */
export const telegramCompleteSchema = registerSchema.pick({ name: true, email: true });

/** Sign-up form: the server schema plus the confirm field (only name, email, password are sent). */
export const registerFormSchema = registerSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirm your password') })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  password: passwordField,
});

/** PATCH /api/auth/email: an unverified user fixes the address their verification link goes to. */
export const changeEmailSchema = z.object({
  email: emailField,
});

/** Shape of the user object the auth endpoints return (see `AuthUser`). */
export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum([USER_ROLES.ADMIN, USER_ROLES.STAFF]),
  status: z.enum([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.REJECTED]),
  emailVerified: z.boolean(),
}) satisfies z.ZodType<AuthUser>;

/** Response of PATCH /api/auth/email; `devMailUrl` only outside production when mail is only logged. */
export const changeEmailResponseSchema = z.object({
  user: authUserSchema,
  devMailUrl: z.string().optional(),
}) satisfies z.ZodType<ChangeEmailResponse>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TelegramVerifyInput = z.infer<typeof telegramVerifySchema>;
export type TelegramCompleteInput = z.infer<typeof telegramCompleteSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
