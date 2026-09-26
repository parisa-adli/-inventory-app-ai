import { USER_ROLES, ACCOUNT_STATUS } from '../constants';

/**
 * Seed users - includes admin and sample staff accounts
 * Passwords will be hashed during seeding (plain text here for reference)
 */
export const seedUsers = [
  {
    name: 'Admin User',
    email: 'admin@inventory.local',
    password: 'Admin@123',  // Will be hashed
    role: USER_ROLES.ADMIN,
    status: ACCOUNT_STATUS.APPROVED,
    emailVerified: true,
    telegramChatId: null,
  },
  {
    name: 'Sarah Manager',
    email: 'sarah.manager@inventory.local',
    password: 'Manager@123',  // Will be hashed
    role: USER_ROLES.MANAGER,
    status: ACCOUNT_STATUS.APPROVED,
    emailVerified: true,
    telegramChatId: '123456789',
  },
  {
    name: 'John Staff',
    email: 'john.staff@inventory.local',
    password: 'Staff@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.APPROVED,
    emailVerified: true,
    telegramChatId: null,
  },
  {
    name: 'Emily Staff',
    email: 'emily.staff@inventory.local',
    password: 'Staff@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.APPROVED,
    emailVerified: true,
    telegramChatId: '987654321',
  },
  {
    name: 'Pending User',
    email: 'pending@inventory.local',
    password: 'Pending@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.PENDING,
    emailVerified: true,
    telegramChatId: null,
  },
  {
    name: 'Rejected User',
    email: 'rejected@inventory.local',
    password: 'Rejected@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.REJECTED,
    emailVerified: true,
    telegramChatId: null,
  },
];
