import { USER_ROLES, ACCOUNT_STATUS } from '../constants';

/**
 * Seed users - includes admin and sample staff accounts
 * Passwords will be hashed during seeding (plain text here for reference)
 * lastLoginHoursAgo: last sign-in relative to seeding time; null = never signed in (pending and rejected users)
 */
export const seedUsers = [
  {
    name: 'Admin User',
    email: 'admin@inventory.local',
    password: 'Admin@123',  // Will be hashed
    role: USER_ROLES.ADMIN,
    status: ACCOUNT_STATUS.ACTIVE,
    emailVerified: true,
    telegramChatId: null,
    lastLoginHoursAgo: 1,
  },
  {
    name: 'Sarah Manager',
    email: 'sarah.manager@inventory.local',
    password: 'Manager@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.ACTIVE,
    emailVerified: true,
    telegramChatId: '123456789',
    lastLoginHoursAgo: 26,
  },
  {
    name: 'John Staff',
    email: 'john.staff@inventory.local',
    password: 'Staff@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.ACTIVE,
    emailVerified: true,
    telegramChatId: null,
    lastLoginHoursAgo: 74,
  },
  {
    name: 'Emily Staff',
    email: 'emily.staff@inventory.local',
    password: 'Staff@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.ACTIVE,
    emailVerified: true,
    telegramChatId: '987654321',
    lastLoginHoursAgo: 221,
  },
  {
    name: 'Pending User',
    email: 'pending@inventory.local',
    password: 'Pending@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.PENDING,
    emailVerified: true,
    telegramChatId: null,
    lastLoginHoursAgo: null,
  },
  {
    name: 'Unverified User',
    email: 'unverified@inventory.local',
    password: 'Unverified@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.PENDING,
    emailVerified: false,  // Admin cannot activate until email is verified
    telegramChatId: null,
    lastLoginHoursAgo: null,
  },
  {
    name: 'Rejected User',
    email: 'rejected@inventory.local',
    password: 'Rejected@123',  // Will be hashed
    role: USER_ROLES.STAFF,
    status: ACCOUNT_STATUS.REJECTED,
    emailVerified: true,
    telegramChatId: null,
    lastLoginHoursAgo: null,
  },
];
