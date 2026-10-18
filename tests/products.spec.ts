import { expect, test, type Page } from '@playwright/test';

// Products page against a stubbed API (#29): create a product and see it in the list.

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };

const stamp = { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' };
const pageOf = (items: unknown[], limit: number) => ({ items, page: 1, limit, total: items.length, totalPages: 1 });

const ELECTRONICS = { id: 'c0000000000000000000000a', title: 'Electronics', description: null, productCount: 0, ...stamp };
const TECHSUPPLY = {
  id: 'f0000000000000000000000b',
  name: 'TechSupply Co.',
  contactPerson: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  productCount: 0,
  ...stamp,
};

/** A stubbed products API: GET lists what POST created; a second POST of a SKU answers 409. */
const stubApi = async (page: Page) => {
  const products: Record<string, unknown>[] = [];
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
  await page.route(/\/api\/categories(\?.*)?$/, (route) => route.fulfill({ json: pageOf([ELECTRONICS], 100) }));
  await page.route(/\/api\/suppliers(\?.*)?$/, (route) => route.fulfill({ json: pageOf([TECHSUPPLY], 100) }));
  await page.route(/\/api\/products(\?.*)?$/, (route, request) => {
    if (request.method() === 'GET') return route.fulfill({ json: pageOf(products, 20) });
    const body = request.postDataJSON();
    bodies.push(body);
    if (products.some((p) => p.sku === body.sku)) {
      return route.fulfill({
        status: 409,
        json: { error: { code: 'DUPLICATE_SKU', message: `A product with SKU ${body.sku} already exists.` } },
      });
    }
    const product = {
      id: `p${products.length + 1}`,
      ...body,
      category: { id: ELECTRONICS.id, name: ELECTRONICS.title },
      supplier: body.supplier ? { id: TECHSUPPLY.id, name: TECHSUPPLY.name } : null,
      quantity: 0,
      imageUrl: body.imageUrl ?? null,
      status: 'active',
      archivedAt: null,
      ...stamp,
    };
    products.push(product);
    return route.fulfill({ status: 201, json: product });
  });
  return bodies;
};

const choose = async (page: Page, label: string, option: string) => {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
};

test.describe('products (stubbed API)', () => {
  test('staff creates a product and sees it in the table; the form has no quantity field', async ({ page }) => {
    const bodies = await stubApi(page);
    await page.goto('/app/products');

    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expect(page.getByText('No products yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Add product' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/quantity/i)).toHaveCount(0);

    // Client-side validation from the shared schema
    await dialog.getByRole('button', { name: 'Create product' }).click();
    await expect(dialog.getByText('Title is required')).toBeVisible();
    await expect(dialog.getByText('Choose a category')).toBeVisible();
    await dialog.getByLabel('SKU').fill('ele 001');
    await dialog.getByLabel('Cost price').fill('1.234');
    await dialog.getByRole('button', { name: 'Create product' }).click();
    await expect(dialog.getByText('SKU may only contain letters, digits and dashes')).toBeVisible();
    await expect(dialog.getByText('Cost price can have at most 2 decimals')).toBeVisible();
    expect(bodies).toHaveLength(0);

    await dialog.getByLabel('Title').fill('Wireless Mouse');
    await dialog.getByLabel('SKU').fill('ele-001');
    await choose(page, 'Category', 'Electronics');
    await dialog.getByLabel('Cost price').fill('12.50');
    await dialog.getByLabel('Sale price').fill('24.99');
    await dialog.getByRole('button', { name: 'Create product' }).click();

    await expect(page.getByText('Wireless Mouse was created')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(bodies).toEqual([
      { title: 'Wireless Mouse', sku: 'ELE-001', category: ELECTRONICS.id, costPrice: 12.5, salePrice: 24.99, unitOfMeasure: 'pcs' },
    ]);

    const row = page.getByRole('row', { name: /Wireless Mouse/ });
    await expect(row).toContainText('ELE-001');
    await expect(row).toContainText('Electronics');
    await expect(row).toContainText('Unassigned');
    await expect(row).toContainText('$12.50');
    await expect(row).toContainText('Out of stock');
    await expect(page.getByText('1 product in inventory')).toBeVisible();
  });

  test('a duplicate SKU shows the 409 in a toast and on the field', async ({ page }) => {
    await stubApi(page);
    await page.goto('/app/products');

    const createMouse = async (title: string, sku: string) => {
      await page.getByRole('button', { name: 'Add product' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Title').fill(title);
      await dialog.getByLabel('SKU').fill(sku);
      await choose(page, 'Category', 'Electronics');
      await choose(page, 'Supplier (optional)', 'TechSupply Co.');
      await dialog.getByLabel('Cost price').fill('1');
      await dialog.getByLabel('Sale price').fill('2');
      await dialog.getByRole('button', { name: 'Create product' }).click();
    };

    await createMouse('Mouse 1', 'ELE-001');
    await expect(page.getByRole('row', { name: /Mouse 1/ })).toContainText('TechSupply Co.');

    // Case and spaces don't make a new SKU: the form sends it normalised, the server answers 409
    await createMouse('Mouse 2', ' ele-001 ');
    const message = 'A product with SKU ELE-001 already exists.';
    await expect(page.locator('[data-sonner-toast]').getByText(message)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(message)).toBeVisible();
  });
});
