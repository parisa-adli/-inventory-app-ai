import { expect, test } from '@playwright/test';

const unauthorized = { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } };

test.describe('client smoke', () => {
  // These tests run without a backend: answer the session probe as "logged out" unless a test overrides it
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill(unauthorized));
    await page.route('**/api/auth/refresh', (route) => route.fulfill(unauthorized));
  });

  test('login page renders with Tailwind styles and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      // The stubbed 401 from the session probe is logged by the browser as a failed resource load
      if (msg.type() === 'error' && !/status of 401/.test(msg.text())) errors.push(msg.text());
    });

    await page.goto('/login');

    const title = page.getByRole('heading', { level: 1, name: 'Inventory Manager' });
    await expect(title).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Log in' })).toBeVisible();

    // text-3xl font-bold => Tailwind CSS is compiled and applied
    await expect(title).toHaveCSS('font-size', '30px');
    await expect(title).toHaveCSS('font-weight', '700');

    expect(errors).toEqual([]);
  });

  test('unauthenticated visit to a protected page ends on the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Log in' })).toBeVisible();
  });

  test('app shell routes and navigates client-side', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // No backend in this test: pretend an active user is logged in
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: { id: '1', name: 'Test Admin', email: 'a@x.com', role: 'admin', status: 'active', emailVerified: true },
      })
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeVisible();

    const nav = page.getByRole('navigation');
    for (const name of ['Dashboard', 'Products', 'Categories', 'Suppliers']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test('uses the shadcn theme variables', async ({ page }) => {
    await page.goto('/login');
    // body { @apply bg-background text-foreground } resolves the HSL theme variables
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});
