import { Schema, model, type InferSchemaType } from 'mongoose';
import { DEFAULT_SETTINGS } from '@inventory/shared';

/** The only value `key` may hold: with the unique index, at most one settings document can exist (C25). */
export const SETTINGS_KEY = 'app';

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, default: SETTINGS_KEY, enum: [SETTINGS_KEY], immutable: true },
    lowStockThreshold: { type: Number, required: true, default: DEFAULT_SETTINGS.lowStockThreshold },
    currency: { type: String, required: true, default: DEFAULT_SETTINGS.currency },
    // null = the defaults, never edited
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

settingsSchema.index({ key: 1 }, { unique: true });

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const Settings = model('Settings', settingsSchema);
