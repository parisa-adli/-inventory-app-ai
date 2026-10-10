import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

// Normalize first, then validate (Zod 4: z.email() replaces the deprecated z.string().email())
const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Password is too long');

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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TelegramVerifyInput = z.infer<typeof telegramVerifySchema>;
export type TelegramCompleteInput = z.infer<typeof telegramCompleteSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
