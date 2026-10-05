import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectDatabase } from './config/database.js';

// Placeholder - will import actual seed data from @inventory/shared in Phase 1
// For now, just demonstrate the structure

const runSeed = async () => {
  try {
    console.log('🌱 Starting seed process...');

    await connectDatabase();

    console.log('⚠️  [Phase 1 TODO] Seed script implementation pending');
    console.log('   - Will import seed data from @inventory/shared');
    console.log('   - Will hash passwords with bcrypt');
    console.log('   - Will insert: Users → Categories → Suppliers → Products → StockMovements');

    await mongoose.connection.close();
    console.log('✅ Seed process completed (placeholder)');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

runSeed();
