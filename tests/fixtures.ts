import { test as base, type Page } from '@playwright/test';

// Every spec stubs the API. The app shell loads GET /api/settings before any page renders (C25), and most specs
// land on the dashboard, whose widgets load their own data (#57), so each page starts with the default settings and
// an empty dashboard stubbed (unstubbed, a 401 from the real API would end the session); a spec registers its own
// route to override them (later routes win).

export const DEFAULT_SETTINGS = { lowStockThreshold: 10, currency: 'USD', updatedAt: '2026-03-01T10:00:00.000Z', updatedBy: null };

export const stubSettings = (page: Page, settings: object = DEFAULT_SETTINGS) =>
  page.route('**/api/settings', (route) => route.fulfill({ json: settings }));

const emptyPage = (limit: number) => ({ items: [], page: 1, limit, total: 0, totalPages: 0 });

/** The dashboard of an empty inventory: zero cards, no alerts, no movements. */
const stubDashboard = async (page: Page) => {
  await page.route('**/api/dashboard/summary', (route) =>
    route.fulfill({
      json: { totalProducts: 0, totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0 },
    })
  );
  await page.route(/\/api\/dashboard\/period-summary(\?.*)?$/, (route) =>
    route.fulfill({ json: { inboundValue: 0, income: 0, cogs: 0, grossProfit: 0 } })
  );
  await page.route('**/api/dashboard/alerts', (route) => route.fulfill({ json: { items: [], total: 0 } }));
  await page.route(/\/api\/dashboard\/movements-chart(\?.*)?$/, (route) =>
    route.fulfill({ json: { range: '30d', granularity: 'day', buckets: [] } })
  );
  await page.route(/\/api\/stock-movements(\?.*)?$/, (route) => route.fulfill({ json: emptyPage(10) }));
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await stubSettings(page);
    await stubDashboard(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
export type { Page, Request } from '@playwright/test';
