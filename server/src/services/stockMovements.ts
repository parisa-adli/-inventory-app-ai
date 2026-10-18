import type { StockMovement as StockMovementDto } from '@inventory/shared';
import type { HydratedDocument } from 'mongoose';
import type { StockMovementDoc } from '../models/StockMovement.js';

interface PopulatedRefs {
  product: { _id: unknown; title: string; sku: string; archivedAt?: Date | null };
  user: { _id: unknown; name: string };
}
type MovementLike = Omit<StockMovementDoc, 'product' | 'user'> & PopulatedRefs & { _id: unknown };

const POPULATE = [
  { path: 'product', select: 'title sku archivedAt' },
  { path: 'user', select: 'name' },
];

const toStockMovement = (doc: MovementLike): StockMovementDto => ({
  id: String(doc._id),
  type: doc.type as StockMovementDto['type'],
  delta: doc.delta,
  quantityAfter: doc.quantityAfter,
  unitCost: doc.unitCost,
  unitPrice: doc.unitPrice,
  note: doc.note ?? null,
  occurredAt: doc.occurredAt.toISOString(),
  product: { id: String(doc.product._id), title: doc.product.title, sku: doc.product.sku, archived: Boolean(doc.product.archivedAt) },
  user: { id: String(doc.user._id), name: doc.user.name },
});

/** A movement the stock module just wrote, in the API shape. */
export const presentMovement = async (movement: HydratedDocument<StockMovementDoc>): Promise<StockMovementDto> => {
  await movement.populate(POPULATE);
  return toStockMovement(movement.toObject() as unknown as MovementLike);
};
