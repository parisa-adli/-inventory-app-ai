import { Schema, model, type InferSchemaType } from 'mongoose';
import { STOCK_MOVEMENT_NOTE_MAX, STOCK_MOVEMENT_TYPES } from '@inventory/shared';

/**
 * One entry in the stock ledger (#27). Written only by the stock module (services/stock.ts), never changed:
 * a correction is a new adjustment. `delta` is signed; `unitCost` / `unitPrice` are the product's prices
 * at that moment, so later price edits don't rewrite the ledger.
 */
const stockMovementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, required: true, enum: Object.values(STOCK_MOVEMENT_TYPES) },
    delta: {
      type: Number,
      required: true,
      validate: { validator: (v: number) => Number.isInteger(v) && v !== 0, message: 'delta must be a non-zero integer' },
    },
    quantityAfter: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, maxlength: STOCK_MOVEMENT_NOTE_MAX, default: null },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Defaults to now; only the seed backdates it
    occurredAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ occurredAt: -1, _id: -1 });
stockMovementSchema.index({ product: 1, occurredAt: -1, _id: -1 });

/** The ledger is append-only: every update and delete path refuses (PRD user story 57). */
const refuse = (action: string) =>
  function () {
    throw new Error(`Stock movements are immutable: ${action} is not allowed`);
  };

stockMovementSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'],
  { document: false, query: true },
  refuse('update')
);
stockMovementSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], { document: false, query: true }, refuse('delete'));
stockMovementSchema.pre(['updateOne', 'deleteOne'], { document: true, query: false }, refuse('update or delete'));
// Model middleware: a bulk write may only insert
stockMovementSchema.pre('bulkWrite', function (ops: Record<string, unknown>[]) {
  if (ops.some((op) => !('insertOne' in op))) throw new Error('Stock movements are immutable: update or delete is not allowed');
});
stockMovementSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Stock movements are immutable: update is not allowed');
});

export type StockMovementDoc = InferSchemaType<typeof stockMovementSchema>;
export const StockMovement = model('StockMovement', stockMovementSchema);
