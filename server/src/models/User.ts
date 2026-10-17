import { Schema, model, type InferSchemaType } from 'mongoose';
import { USER_ROLES, ACCOUNT_STATUS, EMAIL_TOKEN_TYPES } from '@inventory/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional: Telegram-only accounts have no password until they set one
    passwordHash: { type: String },
    role: { type: String, enum: Object.values(USER_ROLES), default: USER_ROLES.STAFF, required: true },
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.PENDING,
      required: true,
    },
    emailVerified: { type: Boolean, default: false, required: true },
    telegramChatId: { type: String },
    // Telegram @handle without the "@", refreshed on every Telegram sign in; shown on the Profile page
    telegramUsername: { type: String },
    // Set by an admin-issued temporary password; every guarded route is closed until the user changes it
    mustChangePassword: { type: Boolean, default: false, required: true },
    // Set whenever every session is ended; access tokens issued before it stop working at once
    sessionsValidAfter: { type: Date },
    // Last admin status change. statusReason is kept only while the account is rejected
    statusReason: { type: String },
    statusChangedAt: { type: Date },
    statusChangedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Set when the last mail to this user failed to send, cleared by the next successful send
    lastEmailFailedAt: { type: Date },
    lastEmailFailedType: { type: String, enum: EMAIL_TOKEN_TYPES },
    // Set whenever a new Session starts (any sign in, or the fresh session after a password change); not on refresh
    lastLoginAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ telegramChatId: 1 }, { unique: true, sparse: true });
// Admin Users list: filter by status, newest first
userSchema.index({ status: 1, createdAt: -1, _id: -1 });
// Admin Users list: "Recently active" sort
userSchema.index({ lastLoginAt: -1, _id: -1 });
// Last-active-admin check
userSchema.index({ role: 1, status: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
