import { test as base, type Page } from '@playwright/test';

// Every spec stubs the API. The app shell loads GET /api/settings before any page renders (C25), so each page
// starts with the default settings stubbed; a spec registers its own route to override them (later routes win).

export const DEFAULT_SETTINGS = { lowStockThreshold: 10, currency: 'USD', updatedAt: '2026-03-01T10:00:00.000Z', updatedBy: null };

export const stubSettings = (page: Page, settings: object = DEFAULT_SETTINGS) =>
  page.route('**/api/settings', (route) => route.fulfill({ json: settings }));

export const test = base.extend({
  page: async ({ page }, use) => {
    await stubSettings(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
export type { Page, Request } from '@playwright/test';
