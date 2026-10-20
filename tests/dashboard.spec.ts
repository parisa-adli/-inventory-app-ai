import { DEFAULT_SETTINGS, expect, stubSettings, test, type Page } from './fixtures';

// The dashboard (#57) against a stubbed API: the time-range dropdown, the "Right now" and range cards, the recent
// movements feed, the alerts table and the In-vs-Out chart (Units / Value), each with its own empty and error states.

const staff = { id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff', status: 'active', emailVerified: true };

const SUMMARY = { totalProducts: 57, totalStockValue: 12345.6, lowStockCount: 9, outOfStockCount: 4 };
const PERIOD = { inboundValue: 5171650.85, income: 2501998.46, cogs: 1476891.2, grossProfit: 1025107.26 };

const MOUSE = { id: 'a0000000000000000000000a', title: 'Wireless Mouse', sku: 'ELE-001', archived: false };
const LAMP = { id: 'b0000000000000000000000b', title: 'Desk Lamp', sku: 'HOM-002', archived: true };

// "Now" is 2026-10-18T10:00Z (see beforeEach)
const MOVEMENTS = [
  {
    id: 'm2',
    type: 'ship',
    delta: -2,
    quantityAfter: 5,
    unitCost: 10,
    unitPrice: 20,
    note: null,
    occurredAt: '2026-10-18T09:45:00.000Z',
    product: LAMP,
    user: { id: 'a1', name: 'Admin' },
  },
  {
    id: 'm1',
    type: 'receive',
    delta: 7,
    quantityAfter: 7,
    unitCost: 10,
    unitPrice: 20,
    note: 'PO 1042',
    occurredAt: '2026-10-17T09:00:00.000Z',
    product: MOUSE,
    user: { id: 's1', name: 'Staff' },
  },
];

const ALERTS = [
  { id: 'p1', title: 'USB Hub', sku: 'ELE-009', quantity: 0, unit: 'pcs', status: 'out' },
  { id: 'p2', title: 'Coffee Beans', sku: 'FOO-003', quantity: 3, unit: 'kg', status: 'low' },
];

/** Tehran-day buckets ending today (2026-10-18), oldest first, with these received / shipped units (values × 10 / × 20). */
const dayBuckets = (values: [number, number][]) =>
  values.map(([received, shipped], i) => ({
    bucketStart: new Date(Date.UTC(2026, 9, 18 - (values.length - 1 - i)) - 3.5 * 3600 * 1000).toISOString(),
    receivedUnits: received,
    shippedUnits: shipped,
    receivedValue: received * 10,
    shippedValue: shipped * 20,
  }));

const WEEK: [number, number][] = [
  [0, 0],
  [12, 3],
  [0, 0],
  [5, 0],
  [0, 8],
  [0, 0],
  [20, 4],
];

type Reply = { status?: number; json: unknown };
type Replies = { summary: () => Reply; period: () => Reply; alerts: () => Reply; chart: () => Reply; movements: () => Reply };

const fail = { status: 500, json: { error: { code: 'INTERNAL', message: 'Something went wrong' } } };

const DEFAULT_REPLIES: Replies = {
  summary: () => ({ json: SUMMARY }),
  period: () => ({ json: PERIOD }),
  alerts: () => ({ json: { items: [], total: 0 } }),
  chart: () => ({ json: { range: '30d', granularity: 'day', buckets: [] } }),
  movements: () => ({ json: { items: [], page: 1, limit: 10, total: 0, totalPages: 0 } }),
};

/** Answers the five dashboard queries (each overridable) and records their query strings. */
const stubApi = async (page: Page, replies: Partial<Replies> = {}) => {
  const answer = { ...DEFAULT_REPLIES, ...replies };
  const queries = { chart: [] as URLSearchParams[], period: [] as URLSearchParams[], movements: [] as URLSearchParams[] };
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: staff }));
  await page.route('**/api/dashboard/summary', (route) => route.fulfill(answer.summary()));
  await page.route(/\/api\/dashboard\/period-summary(\?.*)?$/, (route, request) => {
    queries.period.push(new URL(request.url()).searchParams);
    return route.fulfill(answer.period());
  });
  await page.route('**/api/dashboard/alerts', (route) => route.fulfill(answer.alerts()));
  await page.route(/\/api\/dashboard\/movements-chart(\?.*)?$/, (route, request) => {
    queries.chart.push(new URL(request.url()).searchParams);
    return route.fulfill(answer.chart());
  });
  await page.route(/\/api\/stock-movements(\?.*)?$/, (route, request) => {
    queries.movements.push(new URL(request.url()).searchParams);
    return route.fulfill(answer.movements());
  });
  // The Products page a card or row link opens; unstubbed, a 401 from the real API would end the session mid-test
  await page.route(/\/api\/(products|categories|suppliers)(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], page: 1, limit: 20, total: 0, totalPages: 1 } }),
  );
  return queries;
};

test.use({ timezoneId: 'Asia/Tehran', locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00.000Z'));
});

test.describe('dashboard (stubbed API)', () => {
  test('"Right now" and range cards show the totals, money in the app currency; Low and Out open the filtered Products page', async ({
    page,
  }) => {
    await stubApi(page);
    await page.goto('/app/dashboard');

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    const now = page.getByRole('region', { name: 'Right now' });
    const card = (name: string) => page.getByRole('region', { name, exact: true });
    await expect(now.getByRole('region')).toHaveCount(4);
    await expect(card('Active products')).toContainText('57');
    await expect(card('Stock value')).toContainText('$12,345.60');
    await expect(card('Low stock')).toContainText('9');
    await expect(card('Out of stock')).toContainText('4');

    const period = page.getByRole('region', { name: 'Last 30 days' });
    await expect(period.getByRole('region')).toHaveCount(4);
    await expect(card('Inbound value')).toContainText('$5,171,650.85');
    await expect(card('Income')).toContainText('$2,501,998.46');
    await expect(card('COGS')).toContainText('$1,476,891.20');
    await expect(card('Gross profit')).toContainText('$1,025,107.26');

    await expect(card('Out of stock').getByRole('link')).toHaveAttribute('href', '/app/products?stockStatus=out');
    // The whole card is the link
    await card('Low stock').click();
    await expect(page).toHaveURL(/\/app\/products\?stockStatus=low$/);
  });

  test('the feed lists the 10 latest movements with type, product, change, user and time', async ({ page }) => {
    const queries = await stubApi(page, {
      movements: () => ({ json: { items: MOVEMENTS, page: 1, limit: 10, total: 2, totalPages: 1 } }),
    });
    await page.goto('/app/dashboard');

    const feed = page.getByRole('region', { name: 'Recent movements' });
    const rows = feed.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Ship');
    await expect(rows.nth(0)).toContainText('Desk Lamp');
    await expect(rows.nth(0)).toContainText('Archived');
    await expect(rows.nth(0)).toContainText('−2');
    await expect(rows.nth(0)).toContainText('Admin');
    await expect(rows.nth(0)).toContainText('15 minutes ago');
    await expect(rows.nth(1)).toContainText('Receive');
    await expect(rows.nth(1)).toContainText('+7');
    await expect(rows.nth(1)).toContainText('Staff');
    await expect(rows.nth(1)).toContainText('yesterday');
    expect(queries.movements[0].get('limit')).toBe('10');
    expect(queries.movements[0].get('page')).toBe('1');

    // An archived product is found on the Archived tab
    await expect(rows.nth(0).getByRole('link', { name: 'Desk Lamp' })).toHaveAttribute(
      'href',
      '/app/products?status=archived&search=HOM-002',
    );
    await expect(feed.getByRole('link', { name: 'View all movements' })).toHaveAttribute('href', '/app/movements');
    await rows.nth(1).getByRole('link', { name: 'Wireless Mouse' }).click();
    await expect(page).toHaveURL(/\/app\/products\?search=ELE-001$/);
  });

  test('alerts list what to reorder under the stored threshold, each row opening the product by SKU', async ({ page }) => {
    await stubSettings(page, { ...DEFAULT_SETTINGS, lowStockThreshold: 5 });
    await stubApi(page, { alerts: () => ({ json: { items: ALERTS, total: 2 } }) });
    await page.goto('/app/dashboard');

    const alerts = page.getByRole('region', { name: 'Stock alerts' });
    await expect(alerts).toContainText('Low = 1–5 units');
    for (const header of ['Product', 'Quantity', 'Status']) {
      await expect(alerts.getByRole('columnheader', { name: header })).toBeVisible();
    }
    const rows = alerts.getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('USB Hub');
    for (const header of ['SKU', 'Unit']) {
      await expect(alerts.getByRole('columnheader', { name: header })).toHaveCount(0);
    }
    await expect(rows.nth(1).getByRole('cell').nth(1)).toHaveText('0 pcs');
    await expect(rows.nth(1)).toContainText('Out of stock');
    await expect(rows.nth(2)).toContainText('Low stock');
    await expect(rows.nth(2).getByRole('cell').nth(1)).toHaveText('3 kg');
    // Nothing is hidden, so no footer
    await expect(alerts.getByText(/Showing/)).toHaveCount(0);

    await rows.nth(2).getByRole('link', { name: 'Coffee Beans' }).click();
    await expect(page).toHaveURL(/\/app\/products\?search=FOO-003$/);
  });

  test('capped alerts say how many there are; links under the list open each full filtered list', async ({ page }) => {
    await stubApi(page, { alerts: () => ({ json: { items: ALERTS, total: 31 } }) });
    await page.goto('/app/dashboard');

    const alerts = page.getByRole('region', { name: 'Stock alerts' });
    await expect(alerts).toContainText('Showing 2 of 31');
    await expect(alerts.getByRole('link', { name: 'View out of stock' })).toHaveAttribute('href', '/app/products?stockStatus=out');
    await expect(alerts.getByRole('link', { name: 'View low stock' })).toHaveAttribute('href', '/app/products?stockStatus=low');
  });

  test('no alerts says every product is above the threshold', async ({ page }) => {
    await stubApi(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('region', { name: 'Stock alerts' })).toContainText(
      'Every product is above the low-stock threshold.',
    );
  });

  test('the range dropdown defaults to 30 days in the viewer timezone, lives in ?range= and survives a refresh', async ({
    page,
  }) => {
    const queries = await stubApi(page, {
      chart: () => ({ json: { range: '7d', granularity: 'day', buckets: dayBuckets(WEEK) } }),
    });
    await page.goto('/app/dashboard');

    const picker = page.getByRole('button', { name: /^Time range/ });
    await expect(picker).toHaveText('30 days');
    await expect.poll(() => queries.chart.length).toBeGreaterThan(0);
    await expect.poll(() => queries.period.length).toBeGreaterThan(0);
    expect(queries.chart[0].get('range')).toBe('30d');
    expect(queries.chart[0].get('tz')).toBe('Asia/Tehran');
    expect(queries.period[0].get('range')).toBe('30d');

    await picker.click();
    const items = page.getByRole('menuitemradio');
    await expect(items).toHaveText(['Today', '7 days', '30 days', 'This month', 'All time', 'Custom']);
    await expect(page.getByRole('menuitemradio', { name: '30 days', checked: true })).toBeVisible();
    await expect(page.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
    await page.getByRole('menuitemradio', { name: 'All time' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard\?range=all$/);
    await expect(picker).toHaveText('All time');
    await expect.poll(() => queries.chart.at(-1)?.get('range')).toBe('all');
    await expect.poll(() => queries.period.at(-1)?.get('range')).toBe('all');
    await expect(page.getByRole('region', { name: 'All time' })).toBeVisible();

    // The reload must ask again, for All time
    const before = queries.chart.length;
    await page.reload();
    await expect(picker).toHaveText('All time');
    await expect.poll(() => queries.chart.length).toBeGreaterThan(before);
    expect(queries.chart.at(-1)?.get('range')).toBe('all');

    // Back to the default leaves the URL clean
    await picker.click();
    await page.getByRole('menuitemradio', { name: '30 days' }).click();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });

  test('changing the range keeps the chart on Value', async ({ page }) => {
    await stubApi(page);
    await page.goto('/app/dashboard?chart=value');

    await page.getByRole('button', { name: /^Time range/ }).click();
    await page.getByRole('menuitemradio', { name: '7 days' }).click();
    await expect(page).toHaveURL(/\?chart=value&range=7d$/);
    await expect(page.getByRole('tab', { name: 'Value' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Custom adds From and To days, starting at the last 30 days; each end moves in the URL', async ({ page }) => {
    const queries = await stubApi(page);
    await page.goto('/app/dashboard');

    const picker = page.getByRole('button', { name: /^Time range/ });
    const from = page.getByRole('button', { name: 'From', exact: true });
    const to = page.getByRole('button', { name: 'To', exact: true });
    await expect(from).toHaveCount(0);
    await picker.click();
    await page.getByRole('menuitemradio', { name: 'Custom' }).click();

    await expect(page).toHaveURL(/\?range=custom&from=2026-09-19&to=2026-10-18$/);
    await expect(picker).toHaveText('Custom');
    await expect(from).toHaveText('Sep 19, 2026');
    await expect(to).toHaveText('Oct 18, 2026');
    await expect(page.getByRole('region', { name: 'Sep 19 – Oct 18, 2026' })).toBeVisible();
    await expect.poll(() => queries.period.at(-1)?.get('range')).toBe('custom');

    await from.click();
    const calendar = page.getByRole('dialog');
    // Opens on the picked day's month; From cannot pass To
    await expect(calendar.getByRole('button', { name: /September 19th, 2026/ })).toBeVisible();
    await calendar.getByRole('button', { name: /next month/i }).click();
    await expect(calendar.getByRole('button', { name: /October 19th, 2026/ })).toBeDisabled();
    await calendar.getByRole('button', { name: /October 5th, 2026/ }).click();
    await expect(calendar).toHaveCount(0);
    await expect(page).toHaveURL(/\?range=custom&from=2026-10-05&to=2026-10-18$/);

    await to.click();
    // To cannot go before From, nor into the future
    await expect(calendar.getByRole('button', { name: /October 4th, 2026/ })).toBeDisabled();
    await expect(calendar.getByRole('button', { name: /October 19th, 2026/ })).toBeDisabled();
    await calendar.getByRole('button', { name: /October 12th, 2026/ }).click();
    await expect(page).toHaveURL(/\?range=custom&from=2026-10-05&to=2026-10-12$/);
    await expect(to).toHaveText('Oct 12, 2026');
    await expect.poll(() => queries.chart.at(-1)?.get('to')).toBe('2026-10-12');
    expect(queries.chart.at(-1)?.get('from')).toBe('2026-10-05');
    await expect(page.getByRole('region', { name: 'Oct 5 – 12, 2026' })).toBeVisible();

    // Picking the set day again keeps it: both ends are always set
    await to.click();
    await calendar.getByRole('button', { name: /October 12th, 2026/ }).click();
    await expect(page).toHaveURL(/to=2026-10-12$/);

    // Custom again keeps the days; a preset drops them and the day buttons
    await picker.click();
    await page.getByRole('menuitemradio', { name: 'Custom', checked: true }).click();
    await expect(page).toHaveURL(/\?range=custom&from=2026-10-05&to=2026-10-12$/);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await picker.click();
    await page.getByRole('menuitemradio', { name: '7 days' }).click();
    await expect(page).toHaveURL(/\?range=7d$/);
    await expect(from).toHaveCount(0);
    await expect(to).toHaveCount(0);
  });

  test('custom days the server would refuse fall back to 30 days', async ({ page }) => {
    const queries = await stubApi(page);
    for (const days of ['from=2026-02-30&to=2026-03-05', 'from=1999-12-01&to=2026-01-01', 'from=2026-10-12&to=2026-10-05']) {
      await page.goto(`/app/dashboard?range=custom&${days}`);
      await expect(page.getByRole('button', { name: /^Time range/ })).toHaveText('30 days');
      await expect(page.getByRole('region', { name: 'Last 30 days' })).toBeVisible();
      await expect.poll(() => queries.chart.at(-1)?.get('range')).toBe('30d');
      expect(queries.chart.at(-1)?.has('from')).toBe(false);
    }
  });

  test('the chart switches between units and value, kept in ?chart=value', async ({ page }) => {
    await stubApi(page, { chart: () => ({ json: { range: '7d', granularity: 'day', buckets: dayBuckets(WEEK) } }) });
    await page.goto('/app/dashboard?range=7d');

    const chart = page.getByRole('region', { name: 'Stock in vs out' });
    await expect(chart.getByRole('tab', { name: 'Units' })).toHaveAttribute('aria-selected', 'true');
    const hoverToday = async () => {
      const box = await chart.locator('.recharts-surface').boundingBox();
      if (!box) throw new Error('no chart');
      await page.mouse.move(box.x + box.width * (13 / 14), box.y + box.height / 2);
    };
    const tooltip = chart.locator('.recharts-tooltip-wrapper');
    await hoverToday();
    await expect(tooltip).toContainText('Oct 18');
    await expect(tooltip).toContainText('In20');
    await expect(tooltip).toContainText('Out4');

    await chart.getByRole('tab', { name: 'Value' }).click();
    await expect(page).toHaveURL(/\?range=7d&chart=value$/);
    // The value axis is in short money
    await expect(chart.locator('svg text').filter({ hasText: /^\$\d/ }).first()).toBeVisible();
    await page.mouse.move(0, 0);
    await hoverToday();
    await expect(tooltip).toContainText('$200.00');
    await expect(tooltip).toContainText('$80.00');

    await page.reload();
    await expect(chart.getByRole('tab', { name: 'Value' })).toHaveAttribute('aria-selected', 'true');
  });

  test('a range without receipts or shipments says so', async ({ page }) => {
    await stubApi(page, { chart: () => ({ json: { range: 'month', granularity: 'day', buckets: dayBuckets([[0, 0]]) } }) });
    await page.goto('/app/dashboard?range=month');
    await expect(page.getByRole('region', { name: 'Stock in vs out' })).toContainText(
      'No receipts or shipments in this range (This month).',
    );
  });

  test('Value shows the empty text when the movements in range carry no value', async ({ page }) => {
    const free = dayBuckets([[5, 2]]).map((bucket) => ({ ...bucket, receivedValue: 0, shippedValue: 0 }));
    await stubApi(page, { chart: () => ({ json: { range: 'today', granularity: 'day', buckets: free } }) });
    await page.goto('/app/dashboard?range=today&chart=value');
    const chart = page.getByRole('region', { name: 'Stock in vs out' });
    await expect(chart).toContainText('No receipts or shipments in this range (Today).');

    await chart.getByRole('tab', { name: 'Units' }).click();
    await expect(chart.locator('.recharts-surface')).toBeVisible();
  });

  test('an empty ledger says so in the feed', async ({ page }) => {
    await stubApi(page);
    await page.goto('/app/dashboard');
    await expect(page.getByRole('region', { name: 'Recent movements' })).toContainText('No stock movements yet.');
  });

  test('a failing widget shows its own error and Retry while the others render', async ({ page }) => {
    let summaryUp = false;
    await stubApi(page, {
      summary: () => (summaryUp ? { json: SUMMARY } : fail),
      chart: () => fail,
      movements: () => ({ json: { items: MOVEMENTS, page: 1, limit: 10, total: 2, totalPages: 1 } }),
    });
    await page.goto('/app/dashboard');

    await expect(page.getByText('Could not load the stock totals.')).toBeVisible();
    const chart = page.getByRole('region', { name: 'Stock in vs out' });
    await expect(chart.getByText('Could not load the chart.')).toBeVisible();
    // The others are unaffected
    await expect(page.getByRole('region', { name: 'Recent movements' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Stock alerts' })).toContainText('Every product is above');

    summaryUp = true;
    await page.getByRole('alert').filter({ hasText: 'stock totals' }).getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('region', { name: 'Active products' })).toContainText('57');
    await expect(chart.getByText('Could not load the chart.')).toBeVisible();
  });

  test('a stock change on the Products page shows on the cards and in the feed back on the dashboard', async ({ page }) => {
    const state = { quantity: 1, movements: [] as unknown[] };
    const product = () => ({
      id: 'p1',
      title: 'Wireless Mouse',
      sku: 'ELE-001',
      category: { id: 'c1', name: 'Electronics' },
      supplier: null,
      costPrice: 12.5,
      salePrice: 25,
      quantity: state.quantity,
      unitOfMeasure: 'pcs',
      imageUrl: null,
      status: 'active',
      archivedAt: null,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    });
    const pageOf = (items: unknown[], limit: number) => ({ items, page: 1, limit, total: items.length, totalPages: 1 });
    await stubApi(page, {
      summary: () => ({
        json: { ...SUMMARY, totalProducts: 1, totalStockValue: state.quantity * 12.5 },
      }),
      movements: () => ({ json: pageOf([...state.movements].reverse(), 10) }),
    });
    await page.route(/\/api\/(categories|suppliers)(\?.*)?$/, (route) => route.fulfill({ json: pageOf([], 100) }));
    await page.route(/\/api\/products(\?.*)?$/, (route) => route.fulfill({ json: pageOf([product()], 20) }));
    await page.route('**/api/stock-movements', async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      state.quantity += 1;
      const movement = {
        ...MOVEMENTS[1],
        id: `m${state.movements.length + 1}`,
        delta: 1,
        quantityAfter: state.quantity,
        occurredAt: '2026-10-18T10:00:00.000Z',
      };
      state.movements.push(movement);
      return route.fulfill({ status: 201, json: movement });
    });

    await page.goto('/app/dashboard');
    await expect(page.getByRole('region', { name: 'Stock value' })).toContainText('$12.50');
    await expect(page.getByText('No stock movements yet.')).toBeVisible();

    await page.getByRole('link', { name: 'Products' }).first().click();
    await page.getByRole('button', { name: 'Receive 1 Wireless Mouse' }).click();
    await expect(page.getByText('Received 1 × Wireless Mouse')).toBeVisible();

    await page.getByRole('link', { name: 'Dashboard' }).first().click();
    await expect(page.getByRole('region', { name: 'Stock value' })).toContainText('$25.00');
    const feed = page.getByRole('region', { name: 'Recent movements' });
    await expect(feed.getByRole('listitem')).toHaveCount(1);
    await expect(feed).toContainText('+1');
  });

  test('a threshold saved in Settings re-buckets the alerts back on the dashboard', async ({ page }) => {
    const admin = { ...staff, id: 'a1', name: 'Admin', role: 'admin' };
    let settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    // Coffee Beans (3 kg) is low under 10 and under 5; Desk Lamp (7 pcs) only under 10
    const LAMP_ALERT = { id: 'p3', title: 'Desk Lamp', sku: 'HOM-002', quantity: 7, unit: 'pcs', status: 'low' };
    const alertsFor = (threshold: number) => [ALERTS[1], ...(threshold >= 7 ? [LAMP_ALERT] : [])];
    await stubApi(page, {
      alerts: () => {
        const items = alertsFor(settings.lowStockThreshold as number);
        return { json: { items, total: items.length } };
      },
    });
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: admin }));
    await page.route('**/api/users?*', (route) => route.fulfill({ json: { items: [], page: 1, limit: 1, total: 0, totalPages: 0 } }));
    await page.route('**/api/settings', (route, request) => {
      if (request.method() === 'PATCH') {
        settings = { ...settings, ...request.postDataJSON(), updatedBy: { id: admin.id, name: admin.name } };
      }
      return route.fulfill({ json: settings });
    });

    await page.goto('/app/dashboard');
    const alerts = page.getByRole('region', { name: 'Stock alerts' });
    await expect(alerts).toContainText('Low = 1–10 units');
    await expect(alerts.getByRole('link', { name: 'Desk Lamp' })).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).first().click();
    await page.getByLabel('Low-stock threshold').fill('5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Settings saved')).toBeVisible();

    await page.getByRole('link', { name: 'Dashboard' }).first().click();
    await expect(alerts).toContainText('Low = 1–5 units');
    await expect(alerts.getByRole('link', { name: 'Desk Lamp' })).toHaveCount(0);
    await expect(alerts.getByRole('link', { name: 'Coffee Beans' })).toBeVisible();
  });
});
