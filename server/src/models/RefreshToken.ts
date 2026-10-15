import { Schema, model, type InferSchemaType } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false, required: true },
    // One family per Session (one browser, from sign in to sign out): rotation keeps it.
    // Rows from before families existed have none and count as a session of their own.
    familyId: { type: String },
    familyCreatedAt: { type: Date },
    lastUsedAt: { type: Date },
    userAgent: { type: String },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Profile page: a user's live sessions
refreshTokenSchema.index({ user: 1, revoked: 1 });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshToken = model('RefreshToken', refreshTokenSchema);
