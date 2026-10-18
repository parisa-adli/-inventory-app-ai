import { isValidObjectId, type HydratedDocument } from 'mongoose';
import { STOCK_STATUS_RANGES, UNASSIGNED_SUPPLIER, defaultSortOrder } from '@inventory/shared';
import type {
  CreateProductInput,
  ListProductsQuery,
  Product as ProductDto,
  ProductsPage,
  StockStatus,
  UpdateProductInput,
} from '@inventory/shared';
import { Category } from '../models/Category.js';
import { Product, type ProductDoc } from '../models/Product.js';
import { StockMovement } from '../models/StockMovement.js';
import { Supplier } from '../models/Supplier.js';
import { AppError, NotFoundError, ValidationError, isDuplicateKeyError } from '../utils/errors.js';
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

const assertRefsExist = (input: { category?: string; supplier?: string | null }) =>
  Promise.all([
    assertExists((id) => Category.exists({ _id: id }), input.category, 'Category'),
    assertExists((id) => Supplier.exists({ _id: id }), input.supplier ?? undefined, 'Supplier'),
  ]);

/** Saves a new or edited product; the unique SKU index turns a clash into a 409. */
const save = async (product: HydratedDocument<ProductDoc>): Promise<ProductDto> => {
  try {
    await product.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError(409, 'DUPLICATE_SKU', `A product with SKU ${product.sku} already exists.`);
    throw err;
  }
  await product.populate(POPULATE);
  return toProduct(product.toObject() as unknown as ProductLike);
};

/** POST: always starts at quantity 0 (the shared schema rejects anything else). */
export const createProduct = async (input: CreateProductInput): Promise<ProductDto> => {
  await assertRefsExist(input);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- quantity is never written from a request
  const { quantity, ...fields } = input;
  return save(new Product(fields));
};

/** What an edit may write. Listed here as well as in the strict schema, so no request can reach `quantity`. */
const EDITABLE_FIELDS = [
  'title',
  'sku',
  'category',
  'supplier',
  'costPrice',
  'salePrice',
  'unitOfMeasure',
  'imageUrl',
] as const satisfies readonly (keyof UpdateProductInput)[];

/**
 * PATCH: absent fields stay, `null` clears the supplier or image URL (stored as null, the model's default).
 * Archived products stay editable, confirmed by the user: only their stock is frozen.
 */
export const updateProduct = async (id: string, patch: UpdateProductInput): Promise<ProductDto> => {
  const product = isValidObjectId(id) ? await Product.findById(id) : null;
  if (!product) throw new NotFoundError('Product not found');
  await assertRefsExist(patch);
  for (const field of EDITABLE_FIELDS) {
    if (patch[field] !== undefined) product.set(field, patch[field]);
  }
  return save(product);
};

/**
 * Archive or unarchive (#36). Allowed with stock on hand; archiving freezes stock (the stock module's guard matches
 * `archivedAt: null`) and leaves the history alone. Repeating either is a no-op, so the first archive date is kept.
 */
export const setArchived = async (id: string, archived: boolean): Promise<ProductDto> => {
  const product = isValidObjectId(id) ? await Product.findById(id) : null;
  if (!product) throw new NotFoundError('Product not found');
  if (archived !== Boolean(product.archivedAt)) product.set('archivedAt', archived ? new Date() : null);
  return save(product);
};

const hasMovements = (movementCount: number) =>
  new AppError(
    409,
    'PRODUCT_HAS_MOVEMENTS',
    `This product has ${movementCount} stock movement${movementCount === 1 ? '' : 's'}, so deleting it would erase audit history. Archive it instead.`,
    { movementCount }
  );

/**
 * DELETE (#36): only a product that never had a movement, so the ledger never loses history. The delete also
 * requires quantity 0: every movement that succeeds raises the quantity before its record is written, so one
 * landing between the count and the delete makes the delete miss instead of leaving an orphaned movement.
 */
export const deleteProduct = async (id: string): Promise<void> => {
  if (!isValidObjectId(id) || !(await Product.exists({ _id: id }))) throw new NotFoundError('Product not found');
  const movementCount = await StockMovement.countDocuments({ product: id });
  if (movementCount > 0) throw hasMovements(movementCount);
  const { deletedCount } = await Product.deleteOne({ _id: id, quantity: 0 });
  if (deletedCount === 0) {
    if (!(await Product.exists({ _id: id }))) throw new NotFoundError('Product not found');
    throw hasMovements(Math.max(1, await StockMovement.countDocuments({ product: id })));
  }
};

/** The `quantity` condition of a stock status, from the shared ranges (`getStockStatus` in database form). */
const quantityRange = (stockStatus: StockStatus) => {
  const { min, max } = STOCK_STATUS_RANGES[stockStatus];
  return { ...(min !== undefined && { $gte: min }), ...(max !== undefined && { $lte: max }) };
};

/**
 * GET: one tab (active or archived), filtered by an escaped search, category, supplier (`unassigned` = none)
 * and stock status, then sorted (title A→Z by default, case-insensitive) with an `_id` tie-break in the same
 * direction, so paging never repeats or skips a row.
 */
export const listProducts = async (query: ListProductsQuery): Promise<ProductsPage> => {
  const { search, category, supplier, status, stockStatus, page, limit, sort } = query;
  const direction = (query.order ?? defaultSortOrder(sort)) === 'asc' ? 1 : -1;
  const pattern = search ? new RegExp(escapeRegex(search), 'i') : null;
  // One literal, no property assignments: architecture.test.ts treats assigning a quantity as a stock write
  const filter = {
    archivedAt: status === 'archived' ? { $ne: null } : null,
    ...(pattern && { $or: [{ title: pattern }, { sku: pattern }] }),
    ...(category && { category }),
    ...(supplier && { supplier: supplier === UNASSIGNED_SUPPLIER ? null : supplier }),
    ...(stockStatus && { quantity: quantityRange(stockStatus) }),
  };
  const [total, rows] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ [sort]: direction, _id: direction })
      // Case-insensitive for text only, so number and date sorts can use their plain indexes
      .collation(sort === 'title' || sort === 'sku' ? NAME_COLLATION : { locale: 'simple' })
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
