import { expect, test, type Page } from './fixtures';

// Admin-only archive, unarchive and delete (#36) against a stubbed API that keeps the server's rules: archived
// products leave the active list, and a product with movements cannot be deleted.

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };
const admin = { ...staff, id: 'a1', name: 'Admin', email: 'admin@inventory.local', role: 'admin' };

const stamp = { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:00:00.000Z' };
const pageOf = (items: unknown[], limit: number) => ({ items, page: 1, limit, total: items.length, totalPages: 1 });

const product = (id: string, title: string, sku: string, quantity: number) => ({
  id,
  title,
  sku,
  category: { id: 'c0000000000000000000000a', name: 'Electronics' },
  supplier: null,
  costPrice: 12.5,
  salePrice: 24.99,
  quantity,
  unitOfMeasure: 'pcs',
  imageUrl: null,
  status: 'active',
  archivedAt: null,
  ...stamp,
});

/** Mouse has 7 on hand and 3 movements; Typo was never stocked. */
const stubApi = async (page: Page, user: typeof staff) => {
  const products = [product('p1', 'Wireless Mouse', 'ELE-001', 7), product('p2', 'Typo Product', 'ELE-002', 0)];
  const movementCounts: Record<string, number> = { p1: 3, p2: 0 };
  const requests: string[] = [];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
  await page.route('**/api/users?*', (route) => route.fulfill({ json: pageOf([], 1) }));
  await page.route(/\/api\/categories(\?.*)?$/, (route) => route.fulfill({ json: pageOf([], 100) }));
  await page.route(/\/api\/suppliers(\?.*)?$/, (route) => route.fulfill({ json: pageOf([], 100) }));
  await page.route(/\/api\/products(\?.*)?$/, (route, request) => {
    const status = new URL(request.url()).searchParams.get('status') ?? 'active';
    return route.fulfill({ json: pageOf(products.filter((p) => p.status === status), 20) });
  });
  await page.route(/\/api\/products\/(\w+)(\/(archive|unarchive))?$/, (route, request) => {
    const [, id, , action] = new URL(request.url()).pathname.match(/\/api\/products\/(\w+)(\/(archive|unarchive))?$/)!;
    requests.push(`${request.method()} ${id}${action ? ` ${action}` : ''}`);
    const index = products.findIndex((p) => p.id === id);
    if (request.method() === 'DELETE') {
      const movementCount = movementCounts[id];
      if (movementCount > 0) {
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'PRODUCT_HAS_MOVEMENTS',
              message: `This product has ${movementCount} stock movements, so deleting it would erase audit history. Archive it instead.`,
              details: { movementCount },
            },
          },
        });
      }
      products.splice(index, 1);
      return route.fulfill({ status: 204 });
    }
    const archived = action === 'archive';
    products[index] = { ...products[index], status: archived ? 'archived' : 'active', archivedAt: archived ? '2026-10-18T10:00:00.000Z' : null };
    return route.fulfill({ json: products[index] });
  });
  return requests;
};

const rowOf = (page: Page, title: string) => page.getByRole('row', { name: new RegExp(title) });

test('staff see no archive, unarchive or delete controls', async ({ page }) => {
  await stubApi(page, staff);
  await page.goto('/app/products');
  const row = rowOf(page, 'Wireless Mouse');
  await expect(row.getByRole('button', { name: 'Edit Wireless Mouse' })).toBeVisible();
  await expect(row.getByRole('button', { name: /^(Archive|Unarchive|Delete) / })).toHaveCount(0);
});

test('an admin archives a stocked product after a warning, then unarchives it', async ({ page }) => {
  const requests = await stubApi(page, admin);
  await page.goto('/app/products');

  await rowOf(page, 'Wireless Mouse').getByRole('button', { name: 'Archive Wireless Mouse' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Archive Wireless Mouse?' });
  await expect(dialog).toContainText('Its 7 pcs on hand will leave the stock value.');
  // Cancelling does nothing
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(requests).toEqual([]);

  await rowOf(page, 'Wireless Mouse').getByRole('button', { name: 'Archive Wireless Mouse' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive product' }).click();
  await expect(page.getByText('Wireless Mouse was archived')).toBeVisible();
  await expect(rowOf(page, 'Wireless Mouse')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Archived' }).click();
  const archived = rowOf(page, 'Wireless Mouse');
  await expect(archived.getByRole('button', { name: 'Unarchive Wireless Mouse' })).toBeVisible();
  // Frozen: no stock controls on an archived row
  await expect(archived.getByRole('button', { name: /Receive 1|Ship 1|Adjust stock/ })).toHaveCount(0);

  await archived.getByRole('button', { name: 'Unarchive Wireless Mouse' }).click();
  const restore = page.getByRole('alertdialog', { name: 'Unarchive Wireless Mouse?' });
  await expect(restore).not.toContainText('stock value');
  await restore.getByRole('button', { name: 'Unarchive product' }).click();
  await expect(page.getByText('Wireless Mouse was restored')).toBeVisible();
  await expect(page.getByText('No archived products.')).toBeVisible();
  expect(requests).toEqual(['PATCH p1 archive', 'PATCH p1 unarchive']);
});

test('an admin deletes a never-stocked product; one with movements is refused with the count and Archive instead', async ({
  page,
}) => {
  const requests = await stubApi(page, admin);
  await page.goto('/app/products');

  await rowOf(page, 'Typo Product').getByRole('button', { name: 'Delete Typo Product' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Typo Product?' }).getByRole('button', { name: 'Delete product' }).click();
  await expect(page.getByText('Typo Product was deleted')).toBeVisible();
  await expect(rowOf(page, 'Typo Product')).toHaveCount(0);

  await rowOf(page, 'Wireless Mouse').getByRole('button', { name: 'Delete Wireless Mouse' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete product' }).click();
  const refused = page.getByRole('alertdialog', { name: 'This product has stock history' });
  await expect(refused).toContainText('Wireless Mouse has 3 stock movements');
  await expect(refused.getByRole('button', { name: 'Delete product' })).toHaveCount(0);

  // Archive instead opens the archive confirmation
  await refused.getByRole('button', { name: 'Archive instead' }).click();
  await page.getByRole('alertdialog', { name: 'Archive Wireless Mouse?' }).getByRole('button', { name: 'Archive product' }).click();
  await expect(page.getByText('No products yet.')).toBeVisible();
  expect(requests).toEqual(['DELETE p2', 'DELETE p1', 'PATCH p1 archive']);
});
