import {
  STOCK_MOVEMENT_TYPES,
  type ListStockMovementsQuery,
  type StockMovement as StockMovementDto,
  type StockMovementUser,
  type StockMovementsFilter,
  type StockMovementsPage,
  type StockMovementsSummary,
} from '@inventory/shared';
import { Types, type HydratedDocument } from 'mongoose';
import { Product } from '../models/Product.js';
import { StockMovement, type StockMovementDoc } from '../models/StockMovement.js';
import { User } from '../models/User.js';
import { pageSkip, toPage } from '../utils/pagination.js';
import { NAME_COLLATION, escapeRegex } from '../utils/text.js';

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

/**
 * The Mongo filter for the list and its summary. Ids are cast here because an aggregation does not cast. A search
 * matches product titles and SKUs (archived products included), so it becomes the list of matching product ids.
 */
const toFilter = async ({ product, search, user, type, dateFrom, dateTo }: StockMovementsFilter) => {
  const productIds = search
    ? await Product.find(
        { $or: ['title', 'sku'].map((field) => ({ [field]: new RegExp(escapeRegex(search), 'i') })) },
        '_id'
      ).distinct('_id')
    : null;
  const productFilter = product
    ? productIds
      ? { $in: productIds.filter((id) => String(id) === product) }
      : new Types.ObjectId(product)
    : productIds && { $in: productIds };
  return {
    ...(productFilter && { product: productFilter }),
    ...(user && { user: new Types.ObjectId(user) }),
    ...(type && { type }),
    ...((dateFrom || dateTo) && { occurredAt: { ...(dateFrom && { $gte: dateFrom }), ...(dateTo && { $lte: dateTo }) } }),
  };
};

/** GET: newest `occurredAt` first (ties newest written first), paged. Archived products' movements are included and flagged. */
export const listMovements = async (query: ListStockMovementsQuery): Promise<StockMovementsPage> => {
  const filter = await toFilter(query);
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

const toCents = (value: number) => Math.round(value * 100) / 100;

/** GET /summary: units and money moved by receives and ships under the list's filters. */
export const summarizeMovements = async (query: StockMovementsFilter): Promise<StockMovementsSummary> => {
  const isType = (type: string) => ({ $eq: ['$type', type] });
  const received = isType(STOCK_MOVEMENT_TYPES.RECEIVE);
  const shipped = isType(STOCK_MOVEMENT_TYPES.SHIP);
  const unitsOut = { $abs: '$delta' };
  const [totals] = await StockMovement.aggregate<StockMovementsSummary>([
    { $match: await toFilter(query) },
    {
      $group: {
        _id: null,
        unitsIn: { $sum: { $cond: [received, '$delta', 0] } },
        unitsOut: { $sum: { $cond: [shipped, unitsOut, 0] } },
        inboundValue: { $sum: { $cond: [received, { $multiply: ['$delta', '$unitCost'] }, 0] } },
        income: { $sum: { $cond: [shipped, { $multiply: [unitsOut, '$unitPrice'] }, 0] } },
      },
    },
  ]);
  return {
    unitsIn: totals?.unitsIn ?? 0,
    unitsOut: totals?.unitsOut ?? 0,
    inboundValue: toCents(totals?.inboundValue ?? 0),
    income: toCents(totals?.income ?? 0),
  };
};

/** GET /users: everyone who has made a movement, A→Z, for the "By" filter (viewers cannot list users otherwise). */
export const listMovementUsers = async (): Promise<StockMovementUser[]> => {
  const ids = await StockMovement.distinct('user');
  const users = await User.find({ _id: { $in: ids } }, 'name')
    .collation(NAME_COLLATION)
    .sort({ name: 1 })
    .lean();
  return users.map((user) => ({ id: String(user._id), name: user.name }));
};
