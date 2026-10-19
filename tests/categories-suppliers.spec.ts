import { expect, test, type Page, type Request } from './fixtures';

// Categories and suppliers pages against a stubbed API (Phase 2).

const admin = { id: 'a1', name: 'Admin', email: 'admin@inventory.local', role: 'admin', status: 'active', emailVerified: true };
const staff = { ...admin, id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff' };

const stamp = { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' };
const category = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  description: null,
  productCount: 0,
  ...stamp,
  ...extra,
});
const supplier = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  contactPerson: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  productCount: 0,
  ...stamp,
  ...extra,
});

const pageOf = (items: unknown[], meta: Partial<{ page: number; total: number; totalPages: number }> = {}) => ({
  items,
  page: 1,
  limit: 12,
  total: items.length,
  totalPages: 1,
  ...meta,
});

const signInAs = async (page: Page, user: unknown) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
  // An admin's nav asks for the pending-users count; unstubbed, its 401 would end the session
  await page.route('**/api/users?*', (route) =>
    route.fulfill({ json: { items: [], page: 1, limit: 1, total: 0, totalPages: 1 } }),
  );
};

/** Stubs GET list calls and records each one's query string. */
const stubList = async (page: Page, resource: string, body: (url: URL) => unknown) => {
  const queries: URLSearchParams[] = [];
  await page.route(new RegExp(`/api/${resource}(\\?.*)?$`), (route, request) => {
    if (request.method() !== 'GET') return route.fallback();
    const url = new URL(request.url());
    queries.push(url.searchParams);
    return route.fulfill({ json: body(url) });
  });
  return queries;
};

test.describe('categories and suppliers (stubbed API)', () => {
  test('staff can add and edit, but sees no delete control', async ({ page }) => {
    await signInAs(page, staff);
    await stubList(page, 'categories', () => pageOf([category('c1', 'Electronics', { description: 'Devices', productCount: 3 })]));

    await page.goto('/app/categories');

    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
    await expect(page.getByText('Electronics')).toBeVisible();
    await expect(page.getByText('3 products')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add category' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Electronics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Electronics' })).toHaveCount(0);

    await stubList(page, 'suppliers', () => pageOf([supplier('p1', 'TechSupply Co.')]));
    await page.goto('/app/suppliers');
    await expect(page.getByText('TechSupply Co.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add supplier' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit TechSupply Co.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete TechSupply Co.' })).toHaveCount(0);
  });

  test('admin creates a category; empty optional fields are left out and a duplicate shows on the field', async ({ page }) => {
    await signInAs(page, admin);
    await stubList(page, 'categories', () => pageOf([]));
    const bodies: unknown[] = [];
    await page.route('**/api/categories', (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      bodies.push(request.postDataJSON());
      return bodies.length === 1
        ? route.fulfill({ status: 409, json: { error: { code: 'DUPLICATE_CATEGORY', message: 'A category with this title already exists.' } } })
        : route.fulfill({ status: 201, json: category('c9', 'Snacks') });
    });

    await page.goto('/app/categories');
    await expect(page.getByText('No categories yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByLabel('Title').fill('Snacks');
    await page.getByRole('button', { name: 'Create category' }).click();

    await expect(page.getByRole('dialog').getByText('A category with this title already exists.')).toBeVisible();
    await page.getByRole('button', { name: 'Create category' }).click();

    await expect(page.getByText('Snacks was created')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(bodies).toEqual([{ title: 'Snacks' }, { title: 'Snacks' }]);
  });

  test('admin edits a supplier; an emptied field is sent as null', async ({ page }) => {
    await signInAs(page, admin);
    const acme = supplier('p1', 'Acme', { email: 'sales@acme.test', phone: '+1 555 0100' });
    await stubList(page, 'suppliers', () => pageOf([acme]));
    let patch: Request | null = null;
    await page.route('**/api/suppliers/p1', (route, request) => {
      patch = request;
      return route.fulfill({ json: { ...acme, email: null } });
    });

    await page.goto('/app/suppliers');
    await expect(page.getByRole('link', { name: 'sales@acme.test' })).toHaveAttribute('href', 'mailto:sales@acme.test');
    await page.getByRole('button', { name: 'Edit Acme' }).click();
    await page.getByLabel('Email').fill('');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Acme was saved')).toBeVisible();
    expect(patch!.method()).toBe('PATCH');
    expect(patch!.postDataJSON()).toEqual({
      name: 'Acme',
      contactPerson: null,
      phone: '+1 555 0100',
      email: null,
      address: null,
      notes: null,
    });
  });

  test('deleting a category in use keeps the dialog open with the reason and a link to its products', async ({ page }) => {
    await signInAs(page, admin);
    await stubList(page, 'categories', () => pageOf([category('c1', 'Electronics', { productCount: 2 })]));
    await page.route('**/api/categories/c1', (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'CATEGORY_IN_USE',
            message: 'This category is used by 2 products.',
            details: { productCount: 2, archivedCount: 2 },
          },
        },
      })
    );

    await page.goto('/app/categories');
    await expect(page.getByRole('button', { name: 'Edit Electronics' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Electronics' }).click();
    await expect(page.getByRole('alertdialog').getByText('Delete Electronics?')).toBeVisible();
    await page.getByRole('button', { name: 'Delete category' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Used by products')).toBeVisible();
    await expect(dialog.getByText(/used by 2 products \(2 archived\)/)).toBeVisible();
    // Every blocking product is archived, so the link opens the Archived tab
    await expect(dialog.getByRole('link', { name: 'Show these products' })).toHaveAttribute(
      'href',
      '/app/products?category=c1&status=archived'
    );
    await expect(page.getByText('This category is used by 2 products.')).toBeVisible();
  });

  test('search, sort and page live in the URL and survive a reload', async ({ page }) => {
    await signInAs(page, admin);
    const queries = await stubList(page, 'categories', (url) => {
      const current = Number(url.searchParams.get('page') ?? 1);
      return pageOf([category(`c${current}`, `Item on page ${current}`)], { page: current, total: 30, totalPages: 3 });
    });

    await page.goto('/app/categories');
    await expect(page.getByText('Page 1 of 3')).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Item on page 2')).toBeVisible();

    await page.getByRole('combobox', { name: 'Sort by' }).click();
    await page.getByRole('option', { name: 'Name A→Z' }).click();
    await expect(page).toHaveURL(/sort=name&order=asc/);
    await expect(page).not.toHaveURL(/page=/);

    await page.getByLabel('Search').fill('elec');
    await expect(page).toHaveURL(/search=elec/);

    await page.reload();
    await expect(page.getByLabel('Search')).toHaveValue('elec');
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveText('Name A→Z');
    const last = queries.at(-1)!;
    expect(Object.fromEntries(last)).toMatchObject({ search: 'elec', sort: 'name', order: 'asc', page: '1', limit: '12' });
  });

  test('a page past the end is replaced by the last page', async ({ page }) => {
    await signInAs(page, admin);
    await stubList(page, 'categories', (url) => {
      const current = Number(url.searchParams.get('page') ?? 1);
      return current > 2
        ? pageOf([], { page: current, total: 13, totalPages: 2 })
        : pageOf([category('c13', 'Last one')], { page: current, total: 13, totalPages: 2 });
    });

    await page.goto('/app/categories?page=5');

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Last one')).toBeVisible();
  });
});
