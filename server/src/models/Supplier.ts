import { Schema, model, type InferSchemaType } from 'mongoose';
import { normalizeKey } from '../utils/text.js';

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Uniqueness key (normalizeKey of the name), set on every save; never sent to the client
    nameKey: { type: String, required: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Writes go through document save (services/suppliers.ts), so the key cannot drift from the name
supplierSchema.pre('validate', function () {
  if (typeof this.name === 'string') this.nameKey = normalizeKey(this.name);
});

supplierSchema.index({ nameKey: 1 }, { unique: true });
supplierSchema.index({ createdAt: -1 });

export type SupplierDoc = InferSchemaType<typeof supplierSchema>;
export const Supplier = model('Supplier', supplierSchema);
