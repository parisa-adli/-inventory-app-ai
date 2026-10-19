import { expect, test, type Page } from './fixtures';

// The global Stock Movements page (#33) against a stubbed API: the table, the filters and the states.

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };

const MOUSE = { id: 'a0000000000000000000000a', title: 'Wireless Mouse', sku: 'ELE-001' };
const LAMP = { id: 'b0000000000000000000000b', title: 'Desk Lamp', sku: 'HOM-002' };

const movement = (id: string, fields: Record<string, unknown>) => ({
  id,
  unitCost: 10,
  unitPrice: 20,
  note: null,
  product: { ...MOUSE, archived: false },
  user: { id: 's1', name: 'Staff' },
  ...fields,
});

const MOVEMENTS = [
  movement('m3', {
    type: 'adjustment',
    delta: -1,
    quantityAfter: 4,
    note: 'Damaged in the warehouse',
    occurredAt: '2026-10-17T09:00:00.000Z',
    user: { id: 'a1', name: 'Admin' },
  }),
  movement('m2', {
    type: 'ship',
    delta: -2,
    quantityAfter: 5,
    occurredAt: '2026-10-16T09:00:00.000Z',
    product: { ...LAMP, archived: true },
  }),
  movement('m1', { type: 'receive', delta: 7, quantityAfter: 7, note: 'PO 1042', occurredAt: '2026-10-15T09:00:00.000Z' }),
];

const SUMMARY = { unitsIn: 6000, unitsOut: 1181, inboundValue: 5171650.85, income: 2501998.46 };
const USERS = [
  { id: 'a0000000000000000000000a', name: 'Admin' },
  { id: 'c0000000000000000000000c', name: 'Staff' },
];

/** Answers every movements query with MOVEMENTS (or `respond`), and records the list and summary query strings. */
const stubApi = async (page: Page, respond?: (query: URLSearchParams) => { status: number; json: unknown }) => {
  const movementQueries: URLSearchParams[] = [];
  const summaryQueries: URLSearchParams[] = [];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
  await page.route(/\/api\/stock-movements\/summary(\?.*)?$/, (route, request) => {
    summaryQueries.push(new URL(request.url()).searchParams);
    return route.fulfill({ json: SUMMARY });
  });
  await page.route('**/api/stock-movements/users', (route) => route.fulfill({ json: USERS }));
  await page.route(/\/api\/stock-movements(\?.*)?$/, (route, request) => {
    const query = new URL(request.url()).searchParams;
    movementQueries.push(query);
    if (respond) return route.fulfill(respond(query));
    return route.fulfill({ json: { items: MOVEMENTS, page: 1, limit: 20, total: MOVEMENTS.length, totalPages: 1 } });
  });
  return { movementQueries, summaryQueries };
};

// Local days are checked in a timezone away from UTC (+03:30, no daylight saving), on a fixed "today"
test.use({ timezoneId: 'Asia/Tehran' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00.000Z'));
});

test.describe('stock movements page (stubbed API)', () => {
  test('the sidebar link opens every movement with its product, type, change, note and user', async ({ page }) => {
    await stubApi(page);
    await page.goto('/app/dashboard');
    await page.getByRole('link', { name: 'Movements' }).first().click();

    await expect(page).toHaveURL(/\/app\/movements$/);
    await expect(page.getByRole('heading', { name: 'Stock movements' })).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
    const crumbs = page.getByRole('navigation', { name: 'breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app/dashboard');
    await expect(crumbs.getByText('Stock movements')).toHaveAttribute('aria-current', 'page');

    // The cards total the filtered movements
    await expect(page.getByRole('region', { name: 'Units in' })).toContainText('6,000');
    await expect(page.getByRole('region', { name: 'Units out' })).toContainText('1,181');
    await expect(page.getByRole('region', { name: 'Inbound value' })).toContainText('$5,171,650.85');
    await expect(page.getByRole('region', { name: 'Income' })).toContainText('$2,501,998.46');

    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0).getByRole('columnheader')).toHaveText([
      'When', 'Product', 'Type', 'Change', 'After', 'Unit cost', 'Unit price', 'Value', 'Reason / note', 'By',
    ]);
    // Value: an adjustment is signed at unit cost, a ship counts at unit price, a receive at unit cost
    await expect(rows.nth(1).getByRole('cell').nth(5)).toHaveText('$10.00');
    await expect(rows.nth(1).getByRole('cell').nth(6)).toHaveText('$20.00');
    await expect(rows.nth(1).getByRole('cell').nth(7)).toHaveText('-$10.00');
    await expect(rows.nth(2).getByRole('cell').nth(7)).toHaveText('$40.00');
    await expect(rows.nth(3).getByRole('cell').nth(7)).toHaveText('$70.00');
    // The adjustment shows its reason and who made it
    await expect(rows.nth(1)).toContainText('Wireless Mouse');
    await expect(rows.nth(1)).toContainText('Adjustment');
    await expect(rows.nth(1)).toContainText('−1');
    await expect(rows.nth(1)).toContainText('Damaged in the warehouse');
    await expect(rows.nth(1)).toContainText('Admin');
    // A ship with no note shows a dash; an archived product keeps its history, tagged
    await expect(rows.nth(2)).toContainText('Desk Lamp');
    await expect(rows.nth(2).getByText('Archived')).toBeVisible();
    await expect(rows.nth(2).getByRole('cell').nth(8)).toHaveText('—');
    await expect(rows.nth(2)).toContainText('Staff');
    // A receive with a note shows it
    await expect(rows.nth(3)).toContainText('+7');
    await expect(rows.nth(3)).toContainText('PO 1042');
    await expect(page.getByText('Showing 1–3 of 3')).toBeVisible();
  });

  test('search, type, user and local From / To days reach the list and the cards; Clear filters drops them', async ({ page }) => {
    const { movementQueries, summaryQueries } = await stubApi(page);
    await page.goto('/app/movements');
    await expect(page.getByRole('row')).toHaveCount(4);

    await page.getByRole('searchbox', { name: 'Search' }).fill('hom-');
    await expect.poll(() => movementQueries.at(-1)?.get('search')).toBe('hom-');

    await page.getByRole('combobox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'Ship' }).click();
    await expect.poll(() => movementQueries.at(-1)?.get('type')).toBe('ship');

    await page.getByRole('combobox', { name: 'User' }).click();
    await page.getByRole('option', { name: 'Admin' }).click();
    await expect.poll(() => movementQueries.at(-1)?.get('user')).toBe(USERS[0]!.id);

    // October 1 to 5 in Tehran: from local midnight on the 1st to the last millisecond of the 5th
    await page.getByRole('button', { name: 'From', exact: true }).click();
    await page.getByRole('button', { name: /October 1(st)?,? 2026/ }).click();
    await expect(page.getByRole('button', { name: 'From', exact: true })).toHaveText('Oct 1, 2026');
    await page.getByRole('button', { name: 'To', exact: true }).click();
    await page.getByRole('button', { name: /October 5(th)?,? 2026/ }).click();
    await expect.poll(() => movementQueries.at(-1)?.get('dateTo')).toBe('2026-10-05T20:29:59.999Z');
    for (const last of [movementQueries.at(-1)!, summaryQueries.at(-1)!]) {
      expect(last.get('dateFrom')).toBe('2026-09-30T20:30:00.000Z');
      expect(last.get('search')).toBe('hom-');
      expect(last.get('type')).toBe('ship');
      expect(last.get('user')).toBe(USERS[0]!.id);
    }

    // Back to the unfiltered list (served from the cache it was first loaded into)
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Type' })).toHaveText('All types');
    await expect(page.getByRole('combobox', { name: 'User' })).toHaveText('All users');
    await expect(page.getByRole('button', { name: 'From', exact: true })).toHaveText('Any day');
    await expect(page.getByRole('button', { name: 'To', exact: true })).toHaveText('Any day');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  });

  test('each end is optional: From alone starts at local midnight, To alone ends at the last local millisecond', async ({ page }) => {
    const { movementQueries } = await stubApi(page);
    await page.goto('/app/movements');
    await page.getByRole('button', { name: 'From', exact: true }).click();
    await page.getByRole('button', { name: /October 17(th)?,? 2026/ }).click();
    await expect.poll(() => movementQueries.at(-1)?.get('dateFrom')).toBe('2026-10-16T20:30:00.000Z');
    expect(movementQueries.at(-1)?.has('dateTo')).toBe(false);

    // Picking the day again clears it
    await page.getByRole('button', { name: 'From', exact: true }).click();
    await page.getByRole('button', { name: /October 17(th)?,? 2026/ }).click();
    await page.getByRole('button', { name: 'To', exact: true }).click();
    await page.getByRole('button', { name: /October 17(th)?,? 2026/ }).click();
    await expect.poll(() => movementQueries.at(-1)?.get('dateTo')).toBe('2026-10-17T20:29:59.999Z');
    expect(movementQueries.at(-1)?.has('dateFrom')).toBe(false);
  });

  test('empty and error states', async ({ page }) => {
    let fail = true;
    await stubApi(page, () =>
      fail
        ? { status: 500, json: { error: { code: 'INTERNAL', message: 'Boom' } } }
        : { status: 200, json: { items: [], page: 1, limit: 20, total: 0, totalPages: 1 } }
    );
    await page.goto('/app/movements');
    await expect(page.getByRole('alert').getByText('Could not load stock movements.')).toBeVisible();

    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('No stock movements yet.')).toBeVisible();

    await page.getByRole('combobox', { name: 'Type' }).click();
    await page.getByRole('option', { name: 'Receive' }).click();
    await expect(page.getByText('No movements match these filters.')).toBeVisible();
  });
});
