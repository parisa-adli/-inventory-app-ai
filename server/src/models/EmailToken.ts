import { Schema, model, type InferSchemaType } from 'mongoose';
import { EMAIL_TOKEN_TYPES } from '@inventory/shared';

const emailTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: EMAIL_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false, required: true },
    // Only for 'link-telegram': the chat to attach once the owner confirms by email
    telegramChatId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * `expiresAt` is the logical expiry. Mongo only purges a token this long after it, so an expired
 * link still resolves to TOKEN_EXPIRED for a week before it becomes an unknown (INVALID_TOKEN) one.
 */
export const EMAIL_TOKEN_PURGE_AFTER_SECONDS = 7 * 24 * 60 * 60;
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: EMAIL_TOKEN_PURGE_AFTER_SECONDS });

export type EmailTokenDoc = InferSchemaType<typeof emailTokenSchema>;
export const EmailToken = model('EmailToken', emailTokenSchema);
