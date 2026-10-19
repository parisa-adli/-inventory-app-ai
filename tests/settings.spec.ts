import { DEFAULT_SETTINGS, expect, stubSettings, test, type Page } from './fixtures';

// Settings (#54, C25): an admin changes the low-stock threshold and the currency, and the Products page follows;
// staff get no Settings link or page. The API is stubbed; the server's HTTP tests cover the rules.

const admin = { id: 'a1', name: 'Ada Admin', email: 'admin@inventory.local', role: 'admin', status: 'active', emailVerified: true };
const staff = { ...admin, id: 's1', name: 'Sam Staff', email: 'staff@inventory.local', role: 'staff' };
const stamp = { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' };
const pageOf = (items: unknown[], limit: number) => ({ items, page: 1, limit, total: items.length, totalPages: 1 });

const product = (quantity: number) => ({
  id: `p${quantity}`,
  title: `Qty ${quantity}`,
  sku: `QTY-${quantity}`,
  category: { id: 'c0000000000000000000000a', name: 'Electronics' },
  supplier: null,
  costPrice: 1,
  salePrice: 2,
  quantity,
  unitOfMeasure: 'pcs',
  imageUrl: null,
  status: 'active',
  archivedAt: null,
  ...stamp,
});

/** GET answers the current settings; PATCH merges the body, stamps the caller and records it. */
const stubApi = async (page: Page, user: typeof admin) => {
  let settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const patches: unknown[] = [];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
  await page.route('**/api/users?*', (route) => route.fulfill({ json: pageOf([], 1) }));
  await page.route(/\/api\/(categories|suppliers)(\?.*)?$/, (route) => route.fulfill({ json: pageOf([], 100) }));
  await page.route(/\/api\/products(\?.*)?$/, (route) => route.fulfill({ json: pageOf([5, 6, 10, 11].map(product), 20) }));
  await page.route('**/api/settings', (route, request) => {
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      patches.push(body);
      settings = { ...settings, ...body, updatedAt: '2026-10-19T09:30:00.000Z', updatedBy: { id: user.id, name: user.name } };
    }
    return route.fulfill({ json: settings });
  });
  return patches;
};

/** A product's row; row names start with its "Select …" checkbox. */
const row = (page: Page, title: string) => page.getByRole('row', { name: new RegExp(`^Select ${title} `) });

test.describe('settings (stubbed API)', () => {
  test('an admin lowers the threshold and changes the currency; the products re-bucket and relabel', async ({ page }) => {
    const patches = await stubApi(page, admin);
    await page.goto('/app/products');
    await expect(row(page, 'Qty 6')).toContainText('Low stock');
    await expect(row(page, 'Qty 11')).toContainText('In stock');
    await expect(row(page, 'Qty 6')).toContainText('$1.00');

    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('nobody has edited these settings yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    const threshold = page.getByLabel('Low-stock threshold');
    await threshold.fill('0');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Threshold must be at least 1')).toBeVisible();
    expect(patches).toEqual([]);

    await threshold.fill('5');
    await expect(page.getByText('Low = 1–5 units')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();
    expect(patches).toEqual([{ lowStockThreshold: 5, currency: 'USD' }]);
    await expect(page.getByText(/Last updated .+ by Ada Admin/)).toBeVisible();

    // A new currency asks first; cancelling sends nothing
    await page.getByRole('combobox', { name: 'Currency' }).click();
    await page.getByPlaceholder('Search currency…').fill('euro');
    await page.getByRole('option', { name: 'EUR — Euro' }).click();
    await expect(page.getByText('Existing prices and stock history are not converted')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Change the currency?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(patches).toHaveLength(1);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Change currency' }).click();
    await expect.poll(() => patches.at(-1)).toEqual({ lowStockThreshold: 5, currency: 'EUR' });

    await page.getByRole('link', { name: 'Products' }).first().click();
    await expect(row(page, 'Qty 5')).toContainText('Low stock');
    await expect(row(page, 'Qty 6')).toContainText('In stock');
    await expect(row(page, 'Qty 10')).toContainText('In stock');
    await expect(row(page, 'Qty 6')).toContainText('€1.00');
  });

  test('badges use the stored threshold on a fresh load', async ({ page }) => {
    await stubApi(page, admin);
    await stubSettings(page, { ...DEFAULT_SETTINGS, lowStockThreshold: 6 });
    await page.goto('/app/products');
    await expect(row(page, 'Qty 6')).toContainText('Low stock');
    await expect(row(page, 'Qty 10')).toContainText('In stock');
  });

  test('staff see no Settings link and cannot open the page', async ({ page }) => {
    await stubApi(page, staff);
    await page.goto('/app/products');
    await expect(page.getByRole('link', { name: 'Products' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);

    await page.goto('/app/settings');
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByLabel('Low-stock threshold')).toHaveCount(0);
  });
});
