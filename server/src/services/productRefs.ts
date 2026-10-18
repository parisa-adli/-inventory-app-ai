import type { PipelineStage, Types } from 'mongoose';
import type { InUseDetails } from '@inventory/shared';
import { Product } from '../models/Product.js';

// The category/supplier delete guard and the list counts. Archived products count too: a product is
// archived while `archivedAt` is set (docs/adr/0003).

/** Product fields that reference a catalog record. */
export type ProductRefField = 'category' | 'supplier';

/** How many products (archived included) reference the record; the delete guard blocks on any. */
export const countProductsReferencing = async (field: ProductRefField, id: Types.ObjectId): Promise<InUseDetails> => {
  const [productCount, archivedCount] = await Promise.all([
    Product.countDocuments({ [field]: id }),
    Product.countDocuments({ [field]: id, archivedAt: { $ne: null } }),
  ]);
  return { productCount, archivedCount };
};

/** Aggregate stages that add `productCount` (archived included) to each catalog row. */
export const productCountStages = (field: ProductRefField): PipelineStage[] => [
  {
    $lookup: {
      from: Product.collection.collectionName,
      let: { recordId: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: [`$${field}`, '$$recordId'] } } }, { $count: 'n' }],
      as: 'productCountRows',
    },
  },
  { $addFields: { productCount: { $ifNull: [{ $first: '$productCountRows.n' }, 0] } } },
  { $project: { productCountRows: 0 } },
];
