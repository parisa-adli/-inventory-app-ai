import { Schema, model, type InferSchemaType } from 'mongoose';
import { normalizeKey } from '../utils/text.js';

const categorySchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // Uniqueness key (normalizeKey of the title), set on every save; never sent to the client
    titleKey: { type: String, required: true },
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

// Writes go through document save (services/categories.ts), so the key cannot drift from the title
categorySchema.pre('validate', function () {
  if (typeof this.title === 'string') this.titleKey = normalizeKey(this.title);
});

categorySchema.index({ titleKey: 1 }, { unique: true });
categorySchema.index({ createdAt: -1 });

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const Category = model('Category', categorySchema);
