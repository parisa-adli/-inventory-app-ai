import { expect, test } from '@playwright/test';

test.describe('client smoke', () => {
  test('login page renders with Tailwind styles and no runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/login');

    const title = page.getByRole('heading', { level: 1, name: 'Inventory Manager' });
    await expect(title).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Login' })).toBeVisible();

    // text-3xl font-bold => Tailwind CSS is compiled and applied
    await expect(title).toHaveCSS('font-size', '30px');
    await expect(title).toHaveCSS('font-weight', '700');

    expect(errors).toEqual([]);
  });

  test('app shell routes and navigates client-side', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeVisible();

    const nav = page.getByRole('navigation');
    for (const name of ['Dashboard', 'Products', 'Categories', 'Suppliers']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }

    await nav.getByRole('link', { name: 'Products' }).click();
    await expect(page).toHaveURL(/\/products$/);

    expect(errors).toEqual([]);
  });

  test('uses the shadcn theme variables', async ({ page }) => {
    await page.goto('/login');
    // body { @apply bg-background text-foreground } resolves the HSL theme variables
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
});
