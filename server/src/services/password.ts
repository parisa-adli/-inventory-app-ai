import bcrypt from 'bcrypt';

/** Shared with the seed script so seeded hashes match what the auth service produces. */
export const BCRYPT_ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
