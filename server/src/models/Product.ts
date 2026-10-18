import { Schema, model, type InferSchemaType } from 'mongoose';
import { UNITS_OF_MEASURE } from '@inventory/shared';

const productSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    // Normalised by the shared schema (trimmed, upper-cased), so the unique index compares like with like
    sku: { type: String, required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    costPrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, required: true, min: 0 },
    // Starts at 0; only the stock module changes it, alongside a StockMovement (#27)
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unitOfMeasure: { type: String, required: true, enum: UNITS_OF_MEASURE },
    imageUrl: { type: String, default: null },
    // Set while archived; responses derive `status` from it (docs/adr/0003)
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ archivedAt: 1, title: 1 });
productSchema.index({ category: 1 });
productSchema.index({ supplier: 1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;
export const Product = model('Product', productSchema);
