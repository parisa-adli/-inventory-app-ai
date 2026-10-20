import { expect, test } from './fixtures';

const unauthorized = { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } };
const staff = { id: '1', name: 'Sam Staff', email: 'sam@x.com', role: 'staff', status: 'active', emailVerified: true };

test.describe('theme toggle', () => {
  test('light by default; the moon switches to dark, then the sun back to light, and dark survives a reload', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill(unauthorized));
    await page.route('**/api/auth/refresh', (route) => route.fulfill(unauthorized));
    await page.goto('/login');

    const html = page.locator('html');
    const toggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(html).toHaveClass(/\blight\b/);
    await expect(toggle.locator('svg.lucide-moon')).toBeVisible();
    await expect(toggle.locator('svg.lucide-sun')).toBeHidden();

    await toggle.click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(toggle.locator('svg.lucide-sun')).toBeVisible();
    await expect(toggle.locator('svg.lucide-moon')).toBeHidden();
    await expect(page.locator('body')).toHaveCSS('background-color', /oklch\(0\.145 0 0\)|rgb\(10, 10, 10\)/);
    await expect(page.getByRole('menu')).toHaveCount(0);

    // The inline script in index.html sets the class on its own, before (here: without) the app
    await page.route('**/src/main.tsx', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
    await page.unroute('**/src/main.tsx');
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);

    await toggle.click();
    await expect(html).toHaveClass(/\blight\b/);
    await expect(toggle.locator('svg.lucide-moon')).toBeVisible();
  });

  test('the app top bar has the toggle beside the account menu', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
    await page.goto('/app/dashboard');
    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();

    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });
});
