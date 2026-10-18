import type { CreateProductInput, ListProductsQuery, Product as ProductDto, ProductsPage } from '@inventory/shared';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Supplier } from '../models/Supplier.js';
import { AppError, ValidationError, isDuplicateKeyError } from '../utils/errors.js';
import { NAME_COLLATION, escapeRegex } from '../utils/text.js';

interface ProductLike {
  _id: unknown;
  title: string;
  sku: string;
  category: { _id: unknown; title: string };
  supplier: { _id: unknown; name: string } | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  unitOfMeasure: ProductDto['unitOfMeasure'];
  imageUrl?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Expects category and supplier populated (see POPULATE). */
export const toProduct = (doc: ProductLike): ProductDto => ({
  id: String(doc._id),
  title: doc.title,
  sku: doc.sku,
  category: { id: String(doc.category._id), name: doc.category.title },
  supplier: doc.supplier ? { id: String(doc.supplier._id), name: doc.supplier.name } : null,
  costPrice: doc.costPrice,
  salePrice: doc.salePrice,
  quantity: doc.quantity,
  unitOfMeasure: doc.unitOfMeasure,
  imageUrl: doc.imageUrl ?? null,
  status: doc.archivedAt ? 'archived' : 'active',
  archivedAt: doc.archivedAt?.toISOString() ?? null,
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

const POPULATE = [
  { path: 'category', select: 'title' },
  { path: 'supplier', select: 'name' },
];

/** A referenced category or supplier must exist; a stale select in the form is a 400, not a dangling ref. */
const assertExists = async (exists: (id: string) => Promise<unknown>, id: string | undefined, label: string) => {
  if (id !== undefined && !(await exists(id))) throw new ValidationError(`${label.toLowerCase()}: ${label} not found`);
};

/** POST: always starts at quantity 0 (the shared schema rejects anything else). */
export const createProduct = async (input: CreateProductInput): Promise<ProductDto> => {
  await Promise.all([
    assertExists((id) => Category.exists({ _id: id }), input.category, 'Category'),
    assertExists((id) => Supplier.exists({ _id: id }), input.supplier, 'Supplier'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- quantity is never written from a request
  const { quantity, ...fields } = input;
  try {
    const product = await Product.create(fields);
    await product.populate(POPULATE);
    return toProduct(product.toObject() as unknown as ProductLike);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'DUPLICATE_SKU', `A product with SKU ${input.sku} already exists.`);
    throw err;
  }
};

/** GET: active products, title A→Z (case-insensitive), paged, with an escaped search. Filters and sorts arrive in #34. */
export const listProducts = async ({ search, page, limit }: ListProductsQuery): Promise<ProductsPage> => {
  const filter: Record<string, unknown> = { archivedAt: null };
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: pattern }, { sku: pattern }];
  }
  const [total, rows] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ title: 1, _id: 1 })
      .collation(NAME_COLLATION)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE)
      .lean<ProductLike[]>(),
  ]);
  return {
    items: rows.map(toProduct),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};
