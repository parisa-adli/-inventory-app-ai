import type { Types } from 'mongoose';
import { DEFAULT_SETTINGS, type Settings as SettingsDto, type UpdateSettingsInput } from '@inventory/shared';
import { SETTINGS_KEY, Settings } from '../models/Settings.js';
import { isDuplicateKeyError } from '../utils/errors.js';

interface SettingsLike {
  lowStockThreshold: number;
  currency: string;
  updatedAt: Date;
  updatedBy: { _id: Types.ObjectId; name: string } | null;
}

const toSettings = (doc: SettingsLike): SettingsDto => ({
  lowStockThreshold: doc.lowStockThreshold,
  currency: doc.currency,
  updatedAt: doc.updatedAt.toISOString(),
  updatedBy: doc.updatedBy ? { id: String(doc.updatedBy._id), name: doc.updatedBy.name } : null,
});

const findSettings = () =>
  Settings.findOne({ key: SETTINGS_KEY }).populate('updatedBy', 'name').lean<SettingsLike>();

/**
 * The settings document, created with the defaults when it is missing (e.g. the seed was not run). Read from the
 * DB on every call (C25: no cache). Two first reads at once both try to create; the unique key lets one win.
 */
export const getSettings = async (): Promise<SettingsDto> => {
  const existing = await findSettings();
  if (existing) return toSettings(existing);
  try {
    await Settings.create({ key: SETTINGS_KEY });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  return toSettings((await findSettings())!);
};

/** The stored low-stock threshold, for the products filter and the dashboard. */
export const getLowStockThreshold = async (): Promise<number> => (await getSettings()).lowStockThreshold;

/**
 * PATCH: absent fields stay. Always stamps `updatedBy` and `updatedAt`, even when the values did not change, so the
 * page shows who saved last. Creates the document first if it is missing, with the defaults for what is not sent.
 */
export const updateSettings = async (patch: UpdateSettingsInput, userId: string): Promise<SettingsDto> => {
  const set = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const onInsert = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([field]) => !(field in set)));
  const update = { $set: { ...set, updatedBy: userId }, $setOnInsert: onInsert };
  try {
    await Settings.updateOne({ key: SETTINGS_KEY }, update, { upsert: true });
  } catch (err) {
    // A concurrent first write created the document between the match and the insert: apply to it
    if (!isDuplicateKeyError(err)) throw err;
    await Settings.updateOne({ key: SETTINGS_KEY }, { $set: update.$set });
  }
  return toSettings((await findSettings())!);
};
