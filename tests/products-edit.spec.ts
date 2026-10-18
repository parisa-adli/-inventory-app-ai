import { expect, test, type Page } from '@playwright/test';

// Editing a product (#35) against a stubbed API: the create form in edit mode, PATCH with null clearing the
// supplier, "+ New category" selecting what it made, and a duplicate SKU.

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };

const stamp = { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' };
const pageOf = (items: unknown[], limit: number) => ({ items, page: 1, limit, total: items.length, totalPages: 1 });

const ELECTRONICS = { id: 'c0000000000000000000000a', title: 'Electronics', description: null, productCount: 1, ...stamp };
const OFFICE_ID = 'c0000000000000000000000c';
const TECHSUPPLY = {
  id: 'f0000000000000000000000b',
  name: 'TechSupply Co.',
  contactPerson: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  productCount: 1,
  ...stamp,
};

const MOUSE = {
  id: 'p1',
  title: 'Wireless Mouse',
  sku: 'ELE-001',
  category: { id: ELECTRONICS.id, name: ELECTRONICS.title },
  supplier: { id: TECHSUPPLY.id, name: TECHSUPPLY.name },
  costPrice: 12.5,
  salePrice: 24.99,
  quantity: 7,
  unitOfMeasure: 'pcs',
  imageUrl: null,
  status: 'active',
  archivedAt: null,
  ...stamp,
};

/** A stubbed API: PATCH applies the body to the one product, SKU ELE-002 is taken, POST /categories adds one. */
const stubApi = async (page: Page) => {
  const categories: Record<string, unknown>[] = [ELECTRONICS];
  let product: Record<string, unknown> = { ...MOUSE };
  const patches: Record<string, unknown>[] = [];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
  await page.route(/\/api\/suppliers(\?.*)?$/, (route) => route.fulfill({ json: pageOf([TECHSUPPLY], 100) }));
  await page.route(/\/api\/categories(\?.*)?$/, (route, request) => {
    if (request.method() === 'GET') return route.fulfill({ json: pageOf(categories, 100) });
    const category = { id: OFFICE_ID, description: null, productCount: 0, ...request.postDataJSON(), ...stamp };
    categories.push(category);
    return route.fulfill({ status: 201, json: category });
  });
  await page.route(/\/api\/products(\?.*)?$/, (route) => route.fulfill({ json: pageOf([product], 20) }));
  await page.route(/\/api\/products\/p1$/, (route, request) => {
    const body = request.postDataJSON();
    patches.push(body);
    if (body.sku === 'ELE-002') {
      return route.fulfill({
        status: 409,
        json: { error: { code: 'DUPLICATE_SKU', message: 'A product with SKU ELE-002 already exists.' } },
      });
    }
    const category = categories.find((c) => c.id === body.category)!;
    product = {
      ...product,
      ...body,
      category: { id: category.id, name: category.title },
      supplier: body.supplier ? { id: TECHSUPPLY.id, name: TECHSUPPLY.name } : null,
    };
    return route.fulfill({ json: product });
  });
  return patches;
};

const choose = async (page: Page, label: string, option: string) => {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
};

test.describe('edit a product (stubbed API)', () => {
  test('staff edits the details, clears the supplier and picks a category made inline; stock is untouched', async ({
    page,
  }) => {
    const patches = await stubApi(page);
    await page.goto('/app/products');

    await page.getByRole('button', { name: 'Edit Wireless Mouse' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(dialog.getByLabel('Title')).toHaveValue('Wireless Mouse');
    await expect(dialog.getByLabel('SKU')).toHaveValue('ELE-001');
    await expect(dialog.getByLabel('Cost price')).toHaveValue('12.5');
    await expect(dialog.getByRole('combobox', { name: 'Category' })).toHaveText('Electronics');
    await expect(dialog.getByRole('combobox', { name: 'Supplier (optional)' })).toHaveText('TechSupply Co.');
    await expect(dialog.getByLabel(/quantity/i)).toHaveCount(0);

    // "+ New category" opens the Phase 2 dialog; what it saves is selected in the product form
    await dialog.getByRole('button', { name: 'New category' }).click();
    const categoryDialog = page.getByRole('dialog', { name: 'New category' });
    await categoryDialog.getByLabel('Title').fill('Office');
    await categoryDialog.getByRole('button', { name: 'Create category' }).click();
    await expect(page.getByText('Office was created')).toBeVisible();
    await expect(categoryDialog).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Category' })).toHaveText('Office');
    expect(patches).toHaveLength(0);

    await dialog.getByLabel('Title').fill('Ergonomic Mouse');
    await choose(page, 'Supplier (optional)', 'No supplier');
    await dialog.getByLabel('Sale price').fill('29.50');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Ergonomic Mouse was saved')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(patches).toEqual([
      {
        title: 'Ergonomic Mouse',
        sku: 'ELE-001',
        category: OFFICE_ID,
        supplier: null,
        costPrice: 12.5,
        salePrice: 29.5,
        unitOfMeasure: 'pcs',
        imageUrl: null,
      },
    ]);

    const row = page.getByRole('row', { name: /Ergonomic Mouse/ });
    await expect(row).toContainText('Office');
    await expect(row).toContainText('Unassigned');
    await expect(row).toContainText('$29.50');
    await expect(row).toContainText('7');
  });

  test('changing the SKU to one already taken shows the 409 in a toast and on the field', async ({ page }) => {
    await stubApi(page);
    await page.goto('/app/products');

    await page.getByRole('button', { name: 'Edit Wireless Mouse' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await dialog.getByLabel('SKU').fill(' ele-002');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const message = 'A product with SKU ELE-002 already exists.';
    await expect(page.locator('[data-sonner-toast]').getByText(message)).toBeVisible();
    await expect(dialog.getByText(message)).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
