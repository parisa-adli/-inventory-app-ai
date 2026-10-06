import { Schema, model, type InferSchemaType } from 'mongoose';
import { USER_ROLES, ACCOUNT_STATUS } from '@inventory/shared';

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
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ telegramChatId: 1 }, { unique: true, sparse: true });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
