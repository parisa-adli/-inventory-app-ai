import { Schema, model, type InferSchemaType } from 'mongoose';

export const AUTH_SESSION_STATUSES = [
  'PENDING', // QR shown, waiting for Start in the bot
  'AWAITING_OTP', // bot sent a code, waiting for it on the website
  'AWAITING_PROFILE', // code verified, Telegram account not linked yet: username + email still needed
  'COMPLETED',
  'EXPIRED',
  'LOCKED', // too many wrong codes or profile attempts; "Start over" required
] as const;

// LOGIN / SIGNUP are decided when the code is verified; LINK is set at creation (Profile page, signed in)
export const AUTH_SESSION_PURPOSES = ['LOGIN', 'SIGNUP', 'LINK'] as const;
export type AuthSessionPurpose = (typeof AUTH_SESSION_PURPOSES)[number];

export type AuthSessionStatus = (typeof AUTH_SESSION_STATUSES)[number];

/**
 * One Telegram sign in / sign up attempt (QR -> bot code -> code on the website).
 * `sessionIdHash` identifies the browser (raw value lives in an httpOnly cookie), `nonceHash` travels in the
 * t.me deep link, so someone who only saw the QR code cannot read or finish the session.
 * Nothing secret is stored in clear: the OTP is an HMAC bound to the session.
 */
const authSessionSchema = new Schema(
  {
    sessionIdHash: { type: String, required: true, unique: true },
    nonceHash: { type: String, required: true, unique: true },
    // LOGIN for a linked Telegram account, SIGNUP for a new one (both set at verification);
    // LINK from the Profile page, set at creation together with `user`
    purpose: { type: String, enum: AUTH_SESSION_PURPOSES },
    status: { type: String, enum: AUTH_SESSION_STATUSES, default: 'PENDING', required: true },
    // LOGIN/SIGNUP: who was signed in or created. LINK: the signed-in user who asked to link
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Wrong codes for the current code; reset on resend
    attempts: { type: Number, default: 0 },
    resends: { type: Number, default: 0 },
    // Submissions of the username + email form (capped like OTP attempts)
    completeAttempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date },
    otpExpiresAt: { type: Date },
    otpHash: { type: String },
    prefillDisplayName: { type: String },
    telegramId: { type: Number, index: true },
    telegramUsername: { type: String },
  },
  { timestamps: true }
);

// Mongo removes expired sessions automatically
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthSessionDoc = InferSchemaType<typeof authSessionSchema>;
export const AuthSession = model('AuthSession', authSessionSchema);
