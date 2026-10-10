import { Schema, model, type InferSchemaType } from 'mongoose';

export const TELEGRAM_LOGIN_STATUSES = ['pending', 'approved', 'unlinked', 'consumed'] as const;

/**
 * One QR login attempt. Two independent secrets, both stored only as hashes:
 * `startHash` travels in the QR code to the phone, `pollHash` never leaves the browser that
 * showed the QR code, so someone who only saw the QR code cannot collect the session.
 */
const telegramLoginSchema = new Schema(
  {
    startHash: { type: String, required: true, unique: true },
    pollHash: { type: String, required: true, unique: true },
    status: { type: String, enum: TELEGRAM_LOGIN_STATUSES, default: 'pending', required: true },
    // Set when the linked account pressed Start in the bot
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Mongo removes expired attempts automatically
telegramLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type TelegramLoginDoc = InferSchemaType<typeof telegramLoginSchema>;
export const TelegramLogin = model('TelegramLogin', telegramLoginSchema);
