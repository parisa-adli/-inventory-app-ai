import './config/load-env.js';
import mongoose from 'mongoose';
import { seedCategories as seedCategoryData, seedSuppliers as seedSupplierData, seedUsers as seedUserData } from '@inventory/shared';
import { connectDatabase } from './config/database.js';
import { Category } from './models/Category.js';
import { Supplier } from './models/Supplier.js';
import { User } from './models/User.js';
import { hashPassword } from './services/password.js';
import { normalizeKey } from './utils/text.js';

type UserDoc = InstanceType<typeof User>;

// EmailToken, AuthSession and RefreshToken are runtime-generated and never seeded.
const seedUsers = async (): Promise<Map<string, UserDoc>> => {
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
    });
    userMap.set(user.email, user);
  }

  return userMap;
};

type CategoryDoc = InstanceType<typeof Category>;
type SupplierDoc = InstanceType<typeof Supplier>;

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

const runSeed = async () => {
  try {
    console.log('🌱 Starting seed process...');

    await connectDatabase();

    const userMap = await seedUsers();
    console.log(`✓ Seeded ${userMap.size} users`);

    const categoryMap = await seedCategories();
    console.log(`✓ Seeded ${categoryMap.size} categories`);

    const supplierMap = await seedSuppliers();
    console.log(`✓ Seeded ${supplierMap.size} suppliers`);

    // Phase 03+: products, stock movements

    await mongoose.connection.close();
    console.log('✅ Seed process completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

runSeed();
