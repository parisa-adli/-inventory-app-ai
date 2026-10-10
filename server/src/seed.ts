import './config/load-env.js';
import mongoose from 'mongoose';
import { seedUsers as seedUserData } from '@inventory/shared';
import { connectDatabase } from './config/database.js';
import { User } from './models/User.js';
import { hashPassword } from './services/password.js';

type UserDoc = InstanceType<typeof User>;

// EmailToken, TelegramLogin and RefreshToken are runtime-generated and never seeded.
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

const runSeed = async () => {
  try {
    console.log('🌱 Starting seed process...');

    await connectDatabase();

    const userMap = await seedUsers();
    console.log(`✓ Seeded ${userMap.size} users`);

    // Phase 02+: categories, suppliers, products, stock movements

    await mongoose.connection.close();
    console.log('✅ Seed process completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

runSeed();
