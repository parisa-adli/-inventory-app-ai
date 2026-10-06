import { Schema, model, type InferSchemaType } from 'mongoose';

const otpCodeSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  code: { type: String, required: true }, // hashed 6-digit code
  expiresAt: { type: Date, required: true }, // now + 2 min
  attempts: { type: Number, default: 0, required: true }, // max 3
  lastSentAt: { type: Date, required: true }, // 60s resend cooldown
  consumed: { type: Boolean, default: false, required: true },
});

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpCodeDoc = InferSchemaType<typeof otpCodeSchema>;
export const OtpCode = model('OtpCode', otpCodeSchema);
