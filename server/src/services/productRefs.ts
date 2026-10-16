import mongoose, { type PipelineStage, type Types } from 'mongoose';
import type { InUseDetails } from '@inventory/shared';

// Products arrive in P3. Until then these read the raw `products` collection by field name, so the
// category/supplier delete guard and the list counts already work (tests insert raw documents).
// P3.1: swap both to the Product model and re-verify the guard.

export const PRODUCTS_COLLECTION = 'products';

/** Product fields that reference a catalog record. */
export type ProductRefField = 'category' | 'supplier';

/** How many products (archived included) reference the record; the delete guard blocks on any. */
export const countProductsReferencing = async (field: ProductRefField, id: Types.ObjectId): Promise<InUseDetails> => {
  const products = mongoose.connection.collection(PRODUCTS_COLLECTION);
  const [productCount, archivedCount] = await Promise.all([
    products.countDocuments({ [field]: id }),
    products.countDocuments({ [field]: id, status: 'archived' }),
  ]);
  return { productCount, archivedCount };
};

/** Aggregate stages that add `productCount` (archived included) to each catalog row. */
export const productCountStages = (field: ProductRefField): PipelineStage[] => [
  {
    $lookup: {
      from: PRODUCTS_COLLECTION,
      let: { recordId: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: [`$${field}`, '$$recordId'] } } }, { $count: 'n' }],
      as: 'productCountRows',
    },
  },
  { $addFields: { productCount: { $ifNull: [{ $first: '$productCountRows.n' }, 0] } } },
  { $project: { productCountRows: 0 } },
];
