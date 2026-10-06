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

export const otpRequestSchema = z.object({
  email: emailField,
});

export const otpVerifySchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  password: passwordField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
