import {
  createProductSchema,
  generateSeedMovements,
  seedCategories as seedCategoryData,
  seedProducts as seedProductData,
  seedSuppliers as seedSupplierData,
  seedUsers as seedUserData,
  type SeedMovement,
} from '@inventory/shared';
import { Category } from './models/Category.js';
import { Product } from './models/Product.js';
import { StockMovement } from './models/StockMovement.js';
import { Supplier } from './models/Supplier.js';
import { User } from './models/User.js';
import { hashPassword } from './services/password.js';
import { reconcile, recordMovement } from './services/stock.js';
import { normalizeKey } from './utils/text.js';

type UserDoc = InstanceType<typeof User>;
type CategoryDoc = InstanceType<typeof Category>;
type SupplierDoc = InstanceType<typeof Supplier>;
type ProductDoc = InstanceType<typeof Product>;

const HOUR_MS = 3_600_000;

// EmailToken, AuthSession and RefreshToken are runtime-generated and never seeded.
const seedUsers = async (now: Date): Promise<Map<string, UserDoc>> => {
  const userMap = new Map<string, UserDoc>();

  await User.deleteMany({});

  for (const data of seedUserData) {
    const user = await User.create({
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      role: data.role,
      status: data.status,
      emailVerified: data.emailVerified,
      ...(data.telegramChatId ? { telegramChatId: data.telegramChatId } : {}),
      ...(data.lastLoginHoursAgo !== null ? { lastLoginAt: new Date(now.getTime() - data.lastLoginHoursAgo * HOUR_MS) } : {}),
    });
    userMap.set(user.email, user);
  }

  return userMap;
};

// Categories and suppliers are upserted by their normalized key instead of wiped, so their _ids stay
// stable across re-seeds and records (and product references) created by hand in dev survive.
const seedCategories = async (): Promise<Map<string, CategoryDoc>> => {
  const categoryMap = new Map<string, CategoryDoc>();
  for (const data of seedCategoryData) {
    const category = (await Category.findOne({ titleKey: normalizeKey(data.title) })) ?? new Category();
    category.set(data);
    await category.save();
    categoryMap.set(category.title, category);
  }
  return categoryMap;
};

const seedSuppliers = async (): Promise<Map<string, SupplierDoc>> => {
  const supplierMap = new Map<string, SupplierDoc>();
  for (const data of seedSupplierData) {
    const supplier = (await Supplier.findOne({ nameKey: normalizeKey(data.name) })) ?? new Supplier();
    supplier.set(data);
    await supplier.save();
    supplierMap.set(supplier.name, supplier);
  }
  return supplierMap;
};

const requireRef = <T>(map: Map<string, T>, ref: string, kind: string) => {
  const found = map.get(ref);
  if (!found) throw new Error(`Seed data references a missing ${kind}: "${ref}"`);
  return found;
};

/**
 * Wipes products and the ledger, then creates every product at quantity 0 through the shared create schema.
 * `createdAt` is backdated to just before the product's first movement (two days before today if it has none).
 * The ledger is append-only through the model, so the seed wipes it on the raw collection.
 */
const seedProducts = async (
  categoryMap: Map<string, CategoryDoc>,
  supplierMap: Map<string, SupplierDoc>,
  firstMovementAt: Map<string, Date>,
  today: Date
): Promise<Map<string, ProductDoc>> => {
  await StockMovement.collection.deleteMany({});
  await Product.deleteMany({});

  const productMap = new Map<string, ProductDoc>();
  for (const data of seedProductData) {
    if (data.neverStocked && data.targetQuantity !== 0) throw new Error(`Seed product ${data.sku} is never stocked but targets ${data.targetQuantity}`);
    const fields = createProductSchema.parse({
      title: data.title,
      sku: data.sku,
      category: String(requireRef(categoryMap, data.categoryRef, 'category')._id),
      ...(data.supplierRef !== null && { supplier: String(requireRef(supplierMap, data.supplierRef, 'supplier')._id) }),
      costPrice: data.costPrice,
      salePrice: data.salePrice,
      unitOfMeasure: data.unitOfMeasure,
      ...(data.imageUrl !== null && { imageUrl: data.imageUrl }),
    });
    const createdAt = new Date((firstMovementAt.get(data.sku)?.getTime() ?? today.getTime() - 48 * HOUR_MS) - HOUR_MS);
    productMap.set(fields.sku, await Product.create({ ...fields, createdAt }));
  }
  return productMap;
};

/** Replays each product's ledger in order through the stock module; products run side by side. */
const seedMovements = async (movements: SeedMovement[], productMap: Map<string, ProductDoc>, userMap: Map<string, UserDoc>) => {
  const byProduct = new Map<string, SeedMovement[]>();
  for (const movement of movements) {
    const ledger = byProduct.get(movement.productRef) ?? [];
    ledger.push(movement);
    byProduct.set(movement.productRef, ledger);
  }
  await Promise.all(
    [...byProduct].map(async ([sku, ledger]) => {
      const productId = String(requireRef(productMap, sku, 'product')._id);
      for (const { type, quantity, note, userRef, occurredAt } of ledger) {
        const userId = String(requireRef(userMap, userRef, 'user')._id);
        await recordMovement({ productId, type, quantity, note: note ?? undefined, userId, occurredAt });
      }
    })
  );
};

/** Archived products are archived once their ledger is written: two hours after their last movement. */
const archiveProducts = async (lastMovementAt: Map<string, Date>, productMap: Map<string, ProductDoc>, today: Date) => {
  const archived = seedProductData.filter((data) => data.archived);
  for (const data of archived) {
    const last = lastMovementAt.get(data.sku) ?? today;
    const product = requireRef(productMap, data.sku, 'product');
    await Product.updateOne({ _id: product._id }, { $set: { archivedAt: new Date(last.getTime() + 2 * HOUR_MS) } });
  }
  return archived.length;
};

export interface SeedSummary {
  users: number;
  categories: number;
  suppliers: number;
  products: number;
  movements: number;
  archived: number;
}

/**
 * Resets the database to the seed data (#38). Order: users → categories → suppliers (upserted) → products →
 * movements → archiving. Throws if reconciliation finds any product whose quantity is not its ledger sum.
 * Products and movements depend only on the UTC day of `now`, so two seeds on the same day produce the same data.
 */
export const seedDatabase = async (now = new Date()): Promise<SeedSummary> => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const userMap = await seedUsers(now);
  const categoryMap = await seedCategories();
  const supplierMap = await seedSuppliers();

  const movements = generateSeedMovements(seedProductData, now);
  // Each product's ledger is oldest first
  const firstMovementAt = new Map<string, Date>();
  const lastMovementAt = new Map<string, Date>();
  for (const { productRef, occurredAt } of movements) {
    if (!firstMovementAt.has(productRef)) firstMovementAt.set(productRef, occurredAt);
    lastMovementAt.set(productRef, occurredAt);
  }

  const productMap = await seedProducts(categoryMap, supplierMap, firstMovementAt, today);
  await seedMovements(movements, productMap, userMap);
  const archived = await archiveProducts(lastMovementAt, productMap, today);

  const { mismatches } = await reconcile();
  if (mismatches.length > 0) {
    const list = mismatches.map(({ sku, quantity, ledgerSum }) => `${sku} (quantity ${quantity}, ledger ${ledgerSum})`).join(', ');
    throw new Error(`Seed reconciliation failed: ${list}`);
  }

  return {
    users: userMap.size,
    categories: categoryMap.size,
    suppliers: supplierMap.size,
    products: productMap.size,
    movements: movements.length,
    archived,
  };
};
