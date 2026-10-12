import mongoose from 'mongoose';
import { env } from './env.js';
import { EmailToken } from '../models/EmailToken.js';

/**
 * The EmailToken TTL index changed (expired links are now kept for 7 days); an existing
 * index with other options would otherwise make Mongo reject the new definition.
 */
export const syncEmailTokenIndexes = () => EmailToken.syncIndexes();

export const connectDatabase = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
    await syncEmailTokenIndexes();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});
