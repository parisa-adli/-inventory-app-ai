import { Schema, model } from 'mongoose';

/** One counter per rate-limit key and time window. `_id` is `<key>:<window index>`. */
const rateLimitHitSchema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  // When the window ends; Mongo purges the counter right after
  expiresAt: { type: Date, required: true },
});

rateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitHit = model('RateLimitHit', rateLimitHitSchema);
