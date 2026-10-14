/** Every signed-in page lives under /app, leaving the root free for auth pages (and a public site later). */
export const APP_BASE = '/app';

export const PATHS = {
  dashboard: `${APP_BASE}/dashboard`,
  products: `${APP_BASE}/products`,
  categories: `${APP_BASE}/categories`,
  suppliers: `${APP_BASE}/suppliers`,
  movements: `${APP_BASE}/movements`,
  users: `${APP_BASE}/users`,
  profile: `${APP_BASE}/profile`,
} as const;

/** Where a signed-in user with no gate lands by default. */
export const APP_HOME = PATHS.dashboard;
