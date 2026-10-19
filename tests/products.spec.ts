import { expect, test, type Page } from './fixtures';

// Products page against a stubbed API: create a product (#29), inline -/+ (#30), the Adjust Stock dialog (#31)
// and the Stock History dialog (#32), and the Movements page those changes feed (#39).

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };
const admin = { ...staff, id: 'a1', name: 'Admin', email: 'admin@inventory.local', role: 'admin' };

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
    // The select's placeholder says the same, so look for the field error itself
    await expect(dialog.locator('[data-slot="form-message"]', { hasText: 'Choose a category' })).toBeVisible();
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

test.describe('stock changes (stubbed API)', () => {
  const MOUSE = {
    id: 'p1',
    title: 'Wireless Mouse',
    sku: 'ELE-001',
    category: { id: ELECTRONICS.id, name: ELECTRONICS.title },
    supplier: null,
    costPrice: 12.5,
    salePrice: 24.99,
    quantity: 1,
    unitOfMeasure: 'pcs',
    imageUrl: null,
    status: 'active',
    archivedAt: null,
    ...stamp,
  };

  /**
   * One product whose quantity only the stubbed POST /api/stock-movements changes, with the server's rules:
   * nothing below 0, nothing on an archived product. `hold` delays the next answer until released;
   * `conflictOnHand` makes the next POST lose to a colleague with that much left. GET lists what POST recorded,
   * newest first; `historyQueries` keeps each GET's query string.
   */
  const stubStock = async (page: Page, user = staff) => {
    const state = {
      quantity: MOUSE.quantity,
      archived: false,
      conflictOnHand: null as number | null,
      hold: null as Promise<void> | null,
    };
    const bodies: Record<string, unknown>[] = [];
    const movements: Record<string, unknown>[] = [];
    const historyQueries: URLSearchParams[] = [];
    const conflict = (code: string, message: string, details?: unknown) => ({
      status: 409,
      json: { error: { code, message, ...(details !== undefined && { details }) } },
    });
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
    // An admin's nav asks for the pending-users count; unstubbed, its 401 would end the session
    await page.route('**/api/users?*', (route) => route.fulfill({ json: pageOf([], 1) }));
    // The toolbar's category and supplier filters
    await page.route(/\/api\/categories(\?.*)?$/, (route) => route.fulfill({ json: pageOf([ELECTRONICS], 100) }));
    await page.route(/\/api\/suppliers(\?.*)?$/, (route) => route.fulfill({ json: pageOf([TECHSUPPLY], 100) }));
    // The Active tab, like the real list: an archived product drops out of it
    await page.route(/\/api\/products(\?.*)?$/, (route) =>
      route.fulfill({ json: pageOf(state.archived ? [] : [{ ...MOUSE, quantity: state.quantity }], 20) })
    );
    // The Movements page's cards and "By" filter
    await page.route(/\/api\/stock-movements\/summary(\?.*)?$/, (route) =>
      route.fulfill({ json: { unitsIn: 0, unitsOut: 0, inboundValue: 0, income: 0 } })
    );
    await page.route('**/api/stock-movements/users', (route) => route.fulfill({ json: [] }));
    await page.route(/\/api\/stock-movements(\?.*)?$/, async (route, request) => {
      if (request.method() === 'GET') {
        historyQueries.push(new URL(request.url()).searchParams);
        return route.fulfill({ json: pageOf([...movements].reverse(), 20) });
      }
      const body = request.postDataJSON();
      bodies.push(body);
      if (state.hold) await state.hold;
      if (state.conflictOnHand !== null) {
        state.quantity = state.conflictOnHand;
        state.conflictOnHand = null;
      }
      if (state.archived) {
        return route.fulfill(conflict('PRODUCT_ARCHIVED', 'This product is archived; its stock cannot change.'));
      }
      const delta = body.type === 'ship' ? -body.quantity : body.quantity;
      if (state.quantity + delta < 0) {
        return route.fulfill(conflict('INSUFFICIENT_STOCK', `Only ${state.quantity} on hand.`, { onHand: state.quantity }));
      }
      state.quantity += delta;
      const movement = {
        id: `m${bodies.length}`,
        type: body.type,
        delta,
        quantityAfter: state.quantity,
        unitCost: MOUSE.costPrice,
        unitPrice: MOUSE.salePrice,
        note: body.note ?? null,
        occurredAt: '2026-10-18T10:00:00.000Z',
        product: { id: MOUSE.id, title: MOUSE.title, sku: MOUSE.sku, archived: false },
        user: { id: user.id, name: user.name },
      };
      movements.push(movement);
      return route.fulfill({ status: 201, json: movement });
    });
    return { state, bodies, historyQueries };
  };

  test('+ receives 1 and − ships 1; the buttons wait for the server and − stops at 0', async ({ page }) => {
    const { state, bodies } = await stubStock(page);
    await page.goto('/app/products');

    const row = page.getByRole('row', { name: /Wireless Mouse/ });
    const plus = row.getByRole('button', { name: 'Receive 1 Wireless Mouse' });
    const minus = row.getByRole('button', { name: 'Ship 1 Wireless Mouse' });
    await expect(row).toContainText('Low stock');

    // Not optimistic: while the request runs both buttons are disabled and the number stays
    let release!: () => void;
    state.hold = new Promise((resolve) => (release = resolve));
    await plus.click();
    await expect(plus).toBeDisabled();
    await expect(minus).toBeDisabled();
    await expect(row.getByText('1', { exact: true })).toBeVisible();
    state.hold = null;
    release();

    await expect(page.getByText('Received 1 × Wireless Mouse')).toBeVisible();
    await expect(row.getByText('2', { exact: true })).toBeVisible();
    await expect(plus).toBeEnabled();

    await minus.click();
    await expect(row.getByText('1', { exact: true })).toBeVisible();
    await minus.click();
    await expect(row.getByText('0', { exact: true })).toBeVisible();
    await expect(row).toContainText('Out of stock');
    await expect(minus).toBeDisabled();
    await expect(plus).toBeEnabled();

    expect(bodies).toEqual([
      { productId: 'p1', type: 'receive', quantity: 1 },
      { productId: 'p1', type: 'ship', quantity: 1 },
      { productId: 'p1', type: 'ship', quantity: 1 },
    ]);
  });

  test('a colleague beating me to the last unit shows a toast and the real number', async ({ page }) => {
    const { state } = await stubStock(page);
    await page.goto('/app/products');

    const row = page.getByRole('row', { name: /Wireless Mouse/ });
    await expect(row.getByText('1', { exact: true })).toBeVisible();
    state.conflictOnHand = 0;
    await row.getByRole('button', { name: 'Ship 1 Wireless Mouse' }).click();

    await expect(page.locator('[data-sonner-toast]').getByText('Only 0 on hand.')).toBeVisible();
    await expect(row.getByText('0', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Ship 1 Wireless Mouse' })).toBeDisabled();
  });

  test('rows can be selected on the page, and the Columns menu hides a column until shown again', async ({ page }) => {
    await stubStock(page);
    await page.goto('/app/products');
    const row = page.getByRole('row', { name: /Wireless Mouse/ });

    // Title and SKU share a cell; the quantity shows its unit; every status has a badge, and there is no Status column
    await expect(row).toContainText('ELE-001');
    await expect(row).toContainText('1 pcs');
    await expect(row).toContainText('Low stock');
    await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'SKU' })).toHaveCount(0);

    const selectAll = page.getByRole('checkbox', { name: 'Select all products on this page' });
    await row.getByRole('checkbox', { name: 'Select Wireless Mouse' }).click();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    await expect(selectAll).toBeChecked();
    await selectAll.click();
    await expect(page.getByText('1 selected', { exact: true })).toHaveCount(0);

    const toggleSupplier = async () => {
      await page.getByRole('button', { name: 'Columns' }).click();
      await page.getByRole('menuitemcheckbox', { name: 'Supplier' }).click();
      await page.keyboard.press('Escape');
    };
    await toggleSupplier();
    await expect(page.getByRole('columnheader', { name: 'Supplier' })).toHaveCount(0);
    // Remembered in this browser
    await page.reload();
    await expect(page.getByRole('row', { name: /Wireless Mouse/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Supplier' })).toHaveCount(0);
    await toggleSupplier();
    await expect(page.getByRole('columnheader', { name: 'Supplier' })).toBeVisible();
  });

  test('the selection bar assigns a supplier to the selected products, then clears the selection', async ({ page }) => {
    await stubStock(page);
    let supplier: typeof TECHSUPPLY | null = null;
    const bodies: unknown[] = [];
    // Registered last, so these win over the stubbed list
    await page.route(/\/api\/products(\?.*)?$/, (route) =>
      route.fulfill({
        json: pageOf([{ ...MOUSE, supplier: supplier && { id: supplier.id, name: supplier.name } }], 20),
      })
    );
    await page.route('**/api/products/supplier', (route, request) => {
      bodies.push(request.postDataJSON());
      supplier = TECHSUPPLY;
      return route.fulfill({ json: { updated: 1 } });
    });
    await page.goto('/app/products');
    const row = page.getByRole('row', { name: /Wireless Mouse/ });
    await expect(row).toContainText('Unassigned');

    await row.getByRole('checkbox', { name: 'Select Wireless Mouse' }).click();
    const apply = page.getByRole('button', { name: 'Apply' });
    await expect(apply).toBeDisabled();
    await choose(page, 'Assign supplier', 'TechSupply Co.');
    await apply.click();

    await expect(page.getByText('Supplier assigned to 1 product')).toBeVisible();
    expect(bodies).toEqual([{ ids: ['p1'], supplier: TECHSUPPLY.id }]);
    await expect(row).toContainText('TechSupply Co.');
    await expect(page.getByText('1 selected', { exact: true })).toHaveCount(0);
    await expect(row.getByRole('checkbox', { name: 'Select Wireless Mouse' })).not.toBeChecked();
  });

  const openAdjustStock = async (page: Page, movement: 'Receive' | 'Ship' | 'Adjustment', onHand = 1) => {
    await page.getByRole('button', { name: 'Adjust stock of Wireless Mouse' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adjust stock' });
    await expect(dialog).toContainText(`Wireless Mouse · ${onHand} pcs on hand`);
    await dialog.getByRole('button', { name: movement, exact: true }).click();
    await expect(dialog.getByRole('button', { name: movement, exact: true })).toHaveAttribute('aria-pressed', 'true');
    return dialog;
  };

  test('Receive: an admin receives 5 with a note; the amount must be a whole number', async ({ page }) => {
    const { bodies } = await stubStock(page, admin);
    await page.goto('/app/products');
    const dialog = await openAdjustStock(page, 'Receive');
    const quantity = dialog.getByLabel('Quantity (pcs)');
    const submit = dialog.getByRole('button', { name: 'Receive stock' });

    await quantity.fill('5 boxes');
    await submit.click();
    await expect(dialog.getByText('Quantity must be a number')).toBeVisible();
    await quantity.fill('2.5');
    await submit.click();
    await expect(dialog.getByText('Quantity must be a whole number')).toBeVisible();
    expect(bodies).toHaveLength(0);

    await expect(dialog.getByText('On hand after: 1 pcs')).toBeVisible();
    await quantity.fill('5');
    await expect(dialog.getByText('On hand after: 6 pcs')).toBeVisible();
    await dialog.getByLabel('Note (optional)').fill('  PO-17 ');
    await submit.click();

    await expect(page.getByText('Received 5 × Wireless Mouse')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Wireless Mouse/ }).getByText('6', { exact: true })).toBeVisible();
    expect(bodies).toEqual([{ productId: 'p1', type: 'receive', quantity: 5, note: 'PO-17' }]);
  });

  test('Ship: warns past the count on hand, the server refuses with "only N on hand", then ships what is there', async ({
    page,
  }) => {
    const { bodies } = await stubStock(page);
    await page.goto('/app/products');
    const dialog = await openAdjustStock(page, 'Ship');
    const quantity = dialog.getByLabel('Quantity (pcs)');
    const warning = 'Only 1 on hand. This would take stock below 0 and will be refused.';

    await quantity.fill('1');
    await expect(dialog.getByText(warning)).toHaveCount(0);
    await quantity.fill('3');
    await expect(dialog.getByText(warning)).toBeVisible();

    // A warning, not a block: the server has the last word
    await dialog.getByRole('button', { name: 'Ship stock' }).click();
    await expect(page.locator('[data-sonner-toast]').getByText('Only 1 on hand.')).toBeVisible();
    await expect(dialog.getByText('Only 1 on hand.', { exact: true })).toBeVisible();

    await quantity.fill('1');
    await dialog.getByRole('button', { name: 'Ship stock' }).click();
    await expect(page.getByText('Shipped 1 × Wireless Mouse')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Wireless Mouse/ })).toContainText('Out of stock');
    expect(bodies).toEqual([
      { productId: 'p1', type: 'ship', quantity: 3 },
      { productId: 'p1', type: 'ship', quantity: 1 },
    ]);
  });

  test('Adjustment: a positive amount with a direction and a reason, refused below 0, recorded as a signed change', async ({
    page,
  }) => {
    const { bodies } = await stubStock(page);
    await page.goto('/app/products');
    const dialog = await openAdjustStock(page, 'Adjustment');
    const quantity = dialog.getByLabel('Quantity (pcs)');
    const decrease = dialog.getByRole('button', { name: 'Decrease', exact: true });
    const submit = dialog.getByRole('button', { name: 'Record adjustment' });

    // Increase is chosen first, with its reasons listed
    await expect(dialog.getByRole('button', { name: 'Increase', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('Increase when stock is:')).toBeVisible();
    await quantity.fill('2');
    await expect(dialog.getByText('On hand after: 3 pcs')).toBeVisible();
    await submit.click();
    await expect(dialog.getByText('An adjustment needs a reason')).toBeVisible();
    await dialog.getByLabel('Reason').fill('Shelf count');
    // The sign comes from the direction, not the number
    for (const typed of ['0', '-3']) {
      await quantity.fill(typed);
      await submit.click();
      await expect(dialog.getByText('Quantity must be at least 1')).toBeVisible();
    }
    expect(bodies).toHaveLength(0);

    await decrease.click();
    await expect(decrease).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('Decrease when stock is:')).toBeVisible();
    await expect(dialog.getByText('Expired or damaged')).toBeVisible();
    await quantity.fill('4');
    await expect(dialog.getByText('On hand after: -3 pcs')).toBeVisible();
    await expect(dialog.getByText('Only 1 on hand. This would take stock below 0 and will be refused.')).toBeVisible();
    await submit.click();
    await expect(page.locator('[data-sonner-toast]').getByText('Only 1 on hand.')).toBeVisible();

    await quantity.fill('1');
    await expect(dialog.getByText('On hand after: 0 pcs')).toBeVisible();
    await dialog.getByLabel('Reason').fill('Damaged in transit');
    await submit.click();
    await expect(page.getByText('Adjusted 1 × Wireless Mouse')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Wireless Mouse/ })).toContainText('Out of stock');
    expect(bodies).toEqual([
      { productId: 'p1', type: 'adjustment', quantity: -4, note: 'Shelf count' },
      { productId: 'p1', type: 'adjustment', quantity: -1, note: 'Damaged in transit' },
    ]);
  });

  test('a product archived meanwhile is refused, and the dialog stays open but frozen for every movement', async ({ page }) => {
    const { state, bodies } = await stubStock(page);
    await page.goto('/app/products');
    const dialog = await openAdjustStock(page, 'Ship');

    state.archived = true;
    await dialog.getByLabel('Quantity (pcs)').fill('1');
    await dialog.getByRole('button', { name: 'Ship stock' }).click();
    const message = 'This product is archived; its stock cannot change.';
    await expect(page.locator('[data-sonner-toast]').getByText(message)).toBeVisible();
    // The refetch dropped the product from the active list; the dialog says why and cannot submit again (#36)
    await expect(page.getByText('No products yet.')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveText(message);
    await expect(dialog.getByRole('button', { name: 'Ship stock' })).toBeDisabled();
    for (const [movement, submit] of [
      ['Receive', 'Receive stock'],
      ['Adjustment', 'Record adjustment'],
    ]) {
      await dialog.getByRole('button', { name: movement, exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText(message);
      await expect(dialog.getByRole('button', { name: submit })).toBeDisabled();
    }
    expect(bodies).toHaveLength(1);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('Stock History lists the movements newest first, and a change made meanwhile is on top when it reopens', async ({
    page,
  }) => {
    const { historyQueries } = await stubStock(page);
    await page.goto('/app/products');
    const row = page.getByRole('row', { name: /Wireless Mouse/ });

    await row.getByRole('button', { name: 'Stock history of Wireless Mouse' }).click();
    let dialog = page.getByRole('dialog', { name: 'Stock history' });
    await expect(dialog).toContainText('Wireless Mouse (ELE-001)');
    await expect(dialog.getByText('No stock movements yet.')).toBeVisible();
    expect(historyQueries.at(-1)?.get('product')).toBe('p1');
    await page.keyboard.press('Escape');

    await row.getByRole('button', { name: 'Receive 1 Wireless Mouse' }).click();
    await expect(row.getByText('2', { exact: true })).toBeVisible();
    const adjust = await openAdjustStock(page, 'Ship', 2);
    await adjust.getByLabel('Quantity (pcs)').fill('2');
    await adjust.getByLabel('Note (optional)').fill('Order 1042');
    await adjust.getByRole('button', { name: 'Ship stock' }).click();
    await expect(adjust).toBeHidden();

    await row.getByRole('button', { name: 'Stock history of Wireless Mouse' }).click();
    dialog = page.getByRole('dialog', { name: 'Stock history' });
    const rows = dialog.getByRole('row');
    // A header row, then the ship on top of the receive
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('Ship');
    await expect(rows.nth(1)).toContainText('−2');
    await expect(rows.nth(1)).toContainText('Order 1042');
    await expect(rows.nth(1).getByRole('cell').nth(3)).toHaveText('0');
    await expect(rows.nth(1)).toContainText('Staff');
    await expect(rows.nth(2)).toContainText('Receive');
    await expect(rows.nth(2)).toContainText('+1');
    await expect(rows.nth(2).getByRole('cell').nth(3)).toHaveText('2');
  });

  test('inline −/+ and an adjustment show on the Movements page with the user who made them', async ({ page }) => {
    await stubStock(page);
    await page.goto('/app/products');
    const row = page.getByRole('row', { name: /Wireless Mouse/ });

    await row.getByRole('button', { name: 'Receive 1 Wireless Mouse' }).click();
    await expect(page.getByText('Received 1 × Wireless Mouse')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Receive 1 Wireless Mouse' })).toBeEnabled();
    await row.getByRole('button', { name: 'Ship 1 Wireless Mouse' }).click();
    await expect(page.getByText('Shipped 1 × Wireless Mouse')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Ship 1 Wireless Mouse' })).toBeEnabled();
    const adjust = await openAdjustStock(page, 'Adjustment');
    await adjust.getByLabel('Quantity (pcs)').fill('4');
    await adjust.getByLabel('Reason').fill('Shelf count found four more');
    await adjust.getByRole('button', { name: 'Record adjustment' }).click();
    await expect(adjust).toBeHidden();

    await page.getByRole('link', { name: 'Movements' }).first().click();
    await expect(page).toHaveURL(/\/app\/movements$/);
    const rows = page.getByRole('row');
    // A header row, then newest first; the ship and receive of 1 carry no note
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1)).toContainText('Adjustment');
    await expect(rows.nth(1)).toContainText('+4');
    await expect(rows.nth(1)).toContainText('Shelf count found four more');
    await expect(rows.nth(2)).toContainText('Ship');
    await expect(rows.nth(2)).toContainText('−1');
    await expect(rows.nth(2).getByRole('cell').nth(8)).toHaveText('—');
    await expect(rows.nth(3)).toContainText('Receive');
    await expect(rows.nth(3)).toContainText('+1');
    for (const n of [1, 2, 3]) {
      await expect(rows.nth(n)).toContainText('Wireless Mouse');
      await expect(rows.nth(n).getByRole('cell').last()).toHaveText('Staff');
    }
  });
});
