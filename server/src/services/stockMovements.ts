import type { ListStockMovementsQuery, StockMovement as StockMovementDto, StockMovementsPage } from '@inventory/shared';
import type { HydratedDocument } from 'mongoose';
import { StockMovement, type StockMovementDoc } from '../models/StockMovement.js';
import { pageSkip, toPage } from '../utils/pagination.js';

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

/** GET: newest `occurredAt` first (ties newest written first), paged. Archived products' movements are included and flagged. */
export const listMovements = async (query: ListStockMovementsQuery): Promise<StockMovementsPage> => {
  const { product, type, dateFrom, dateTo } = query;
  const filter = {
    ...(product && { product }),
    ...(type && { type }),
    ...((dateFrom || dateTo) && { occurredAt: { ...(dateFrom && { $gte: dateFrom }), ...(dateTo && { $lte: dateTo }) } }),
  };
  const [total, rows] = await Promise.all([
    StockMovement.countDocuments(filter),
    StockMovement.find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .skip(pageSkip(query))
      .limit(query.limit)
      .populate(POPULATE)
      .lean<MovementLike[]>(),
  ]);
  return toPage(rows.map(toStockMovement), total, query);
};
