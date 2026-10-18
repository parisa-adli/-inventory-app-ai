import './config/load-env.js';
import mongoose from 'mongoose';
import { connectDatabase } from './config/database.js';
import { seedDatabase } from './seedDatabase.js';

const runSeed = async () => {
  try {
    console.log('🌱 Starting seed process...');

    await connectDatabase();

    const summary = await seedDatabase();
    console.log(`✓ Seeded ${summary.users} users`);
    console.log(`✓ Seeded ${summary.categories} categories`);
    console.log(`✓ Seeded ${summary.suppliers} suppliers`);
    console.log(`✓ Seeded ${summary.products} products (${summary.archived} archived)`);
    console.log(`✓ Seeded ${summary.movements} stock movements; reconciliation clean`);

    await mongoose.connection.close();
    console.log('✅ Seed process completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

runSeed();
