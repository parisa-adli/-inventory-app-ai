import { expect, test, type Page } from './fixtures';

// Finding products (#34): search, filters, the Active/Archived tabs and the server-side sort, all kept in the URL.
// The API is stubbed; the filtering itself is covered by the server's HTTP tests.

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };
const stamp = { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' };
const pageOf = (items: unknown[], limit: number) => ({ items, page: 1, limit, total: items.length, totalPages: 1 });

const ELECTRONICS = { id: 'c0000000000000000000000a', title: 'Electronics', description: null, productCount: 2, ...stamp };
const TOOLS = { id: 'c0000000000000000000000b', title: 'Tools', description: null, productCount: 1, ...stamp };
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

const product = (id: string, title: string, quantity: number, supplier: boolean) => ({
  id,
  title,
  sku: `SKU-${id}`,
  category: { id: ELECTRONICS.id, name: ELECTRONICS.title },
  supplier: supplier ? { id: TECHSUPPLY.id, name: TECHSUPPLY.name } : null,
  costPrice: 1,
  salePrice: 2,
  quantity,
  unitOfMeasure: 'pcs',
  imageUrl: null,
  status: 'active',
  archivedAt: null,
  ...stamp,
});

/**
 * Answers every products GET with the same rows, `total` products in all, and records each request's query.
 * A page past the end is answered like the server does: an empty page with the real `totalPages`.
 */
const stubApi = async (page: Page, total = 2) => {
  const queries: URLSearchParams[] = [];
  const rows = [product('p1', 'Cable (2m)', 4, false), product('p2', 'Drill', 30, true)];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
  await page.route(/\/api\/categories(\?.*)?$/, (route) => route.fulfill({ json: pageOf([ELECTRONICS, TOOLS], 100) }));
  await page.route(/\/api\/suppliers(\?.*)?$/, (route) => route.fulfill({ json: pageOf([TECHSUPPLY], 100) }));
  await page.route(/\/api\/products(\?.*)?$/, (route, request) => {
    const query = new URL(request.url()).searchParams;
    queries.push(query);
    const current = Number(query.get('page'));
    const totalPages = Math.max(1, Math.ceil(total / 20));
    const items = current > totalPages ? [] : rows;
    return route.fulfill({ json: { items, page: current, limit: 20, total, totalPages } });
  });
  return { last: () => Object.fromEntries(queries.at(-1) ?? []) };
};

const choose = async (page: Page, label: string, option: string) => {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

const header = (page: Page, name: string) => page.getByRole('columnheader', { name, exact: true });

test.describe('finding products (stubbed API)', () => {
  test('filters, search, tab and sort go into the URL and the query, and a reload opens the same view', async ({ page }) => {
    const api = await stubApi(page);
    await page.goto('/app/products');

    // Defaults: active tab, newest first, nothing in the URL
    await expect(page.getByRole('row', { name: /Drill/ })).toBeVisible();
    expect(api.last()).toEqual({ status: 'active', page: '1', limit: '20', sort: 'createdAt', order: 'desc' });
    await expect(header(page, 'Product')).toHaveAttribute('aria-sort', 'none');
    await expect(header(page, 'Category')).not.toHaveAttribute('aria-sort');

    // Product goes A→Z on the first click, then Z→A
    await header(page, 'Product').getByRole('button').click();
    await expect(header(page, 'Product')).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(api.last).toMatchObject({ sort: 'title', order: 'asc' });
    await header(page, 'Product').getByRole('button').click();
    await expect(header(page, 'Product')).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(api.last).toMatchObject({ sort: 'title', order: 'desc' });

    await choose(page, 'Supplier', 'Unassigned');
    await choose(page, 'Stock status', 'Low stock');
    await choose(page, 'Category', 'Tools');
    await page.getByRole('searchbox', { name: 'Search' }).fill('(2m)');
    await expect(page).toHaveURL(/search=%282m%29/);

    // Numbers sort highest first on the first click, then flip
    await header(page, 'Quantity').getByRole('button').click();
    await expect(header(page, 'Quantity')).toHaveAttribute('aria-sort', 'descending');
    await header(page, 'Quantity').getByRole('button').click();
    await expect(header(page, 'Quantity')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 'Product')).toHaveAttribute('aria-sort', 'none');

    await page.getByRole('tab', { name: 'Archived' }).click();

    const expected = {
      status: 'archived',
      page: '1',
      limit: '20',
      sort: 'quantity',
      order: 'asc',
      search: '(2m)',
      category: TOOLS.id,
      supplier: 'unassigned',
      stockStatus: 'low',
    };
    await expect.poll(api.last).toEqual(expected);
    const url = new URL(page.url());
    expect(Object.fromEntries(url.searchParams)).toEqual({
      supplier: 'unassigned',
      stockStatus: 'low',
      category: TOOLS.id,
      search: '(2m)',
      sort: 'quantity',
      order: 'asc',
      status: 'archived',
    });

    await page.reload();
    await expect(page.getByRole('row', { name: /Drill/ })).toBeVisible();
    expect(api.last()).toEqual(expected);
    await expect(page.getByRole('tab', { name: 'Archived' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('combobox', { name: 'Supplier' })).toHaveText('Unassigned');
    await expect(page.getByRole('combobox', { name: 'Stock status' })).toHaveText('Low stock');
    await expect(page.getByRole('combobox', { name: 'Category' })).toHaveText('Tools');
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('(2m)');
    await expect(header(page, 'Quantity')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.getByText('2 archived products match')).toBeVisible();

    // Clear filters keeps the tab and the sort
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect.poll(api.last).toEqual({ status: 'archived', page: '1', limit: '20', sort: 'quantity', order: 'asc' });
  });

  test('a page past the end is replaced by the last, and a filter change returns to page 1', async ({ page }) => {
    const api = await stubApi(page, 45);
    await page.goto('/app/products?page=9&sort=createdAt');

    await expect(page).toHaveURL(/page=3/);
    await expect.poll(api.last).toMatchObject({ page: '3', sort: 'createdAt', order: 'desc' });
    await expect(page.getByText('Page 3 of 3')).toBeVisible();

    await choose(page, 'Stock status', 'Out of stock');
    await expect(page).not.toHaveURL(/page=/);
    await expect.poll(api.last).toMatchObject({ page: '1', stockStatus: 'out', sort: 'createdAt' });

    // A sort change also starts again on page 1
    await page.getByRole('button', { name: 'Next' }).click();
    await expect.poll(api.last).toMatchObject({ page: '2' });
    await header(page, 'Cost').getByRole('button').click();
    await expect.poll(api.last).toMatchObject({ page: '1', sort: 'costPrice', order: 'desc' });
  });

  test('an empty filtered list says so', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
    await page.route(/\/api\/(categories|suppliers)(\?.*)?$/, (route) => route.fulfill({ json: pageOf([], 100) }));
    await page.route(/\/api\/products(\?.*)?$/, (route) => route.fulfill({ json: pageOf([], 20) }));

    await page.goto('/app/products?stockStatus=out');
    await expect(page.getByText('No products match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('No products yet.')).toBeVisible();
    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(page.getByText('No archived products.')).toBeVisible();
  });
});
