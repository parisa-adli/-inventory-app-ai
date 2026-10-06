import { Schema, model, type InferSchemaType } from 'mongoose';

export const EMAIL_TOKEN_TYPES = ['verify-email', 'reset-password', 'link-telegram'] as const;

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

// Mongo removes expired tokens automatically
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailTokenDoc = InferSchemaType<typeof emailTokenSchema>;
export const EmailToken = model('EmailToken', emailTokenSchema);
