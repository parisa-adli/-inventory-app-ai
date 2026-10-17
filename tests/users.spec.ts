import { expect, test, type Page } from '@playwright/test';

const admin = {
  id: 'a1',
  name: 'Admin',
  email: 'admin@inventory.local',
  role: 'admin',
  status: 'active',
  emailVerified: true,
};
const staff = { ...admin, id: 's1', name: 'Staff', email: 'staff@inventory.local', role: 'staff' };

const pendingUser = (overrides: Record<string, unknown>) => ({
  role: 'staff',
  status: 'pending',
  telegramLinked: false,
  createdAt: '2026-03-01T10:00:00.000Z',
  lastLoginAt: null,
  ...overrides,
});

const verified = pendingUser({ id: 'u1', name: 'Vera Verified', email: 'vera@inventory.local', emailVerified: true });
const unverified = pendingUser({ id: 'u2', name: 'Uli Unverified', email: 'uli@inventory.local', emailVerified: false });

const page1 = (items: unknown[], totalPages = 1) => ({
  items,
  page: 1,
  limit: 20,
  total: items.length,
  totalPages,
});

const signInAs = async (page: Page, user: unknown) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: user }));
};

/** The nav's pending-count request: the pending list with page size 1. */
const isPendingCount = (url: URL) =>
  url.searchParams.get('status') === 'pending' && url.searchParams.get('limit') === '1';

/** Stubs GET /api/users and records each list call's query string (not the pending-count calls). */
const stubUsers = async (page: Page, body: (url: URL) => unknown = () => page1([verified])) => {
  const queries: Record<string, string>[] = [];
  await page.route('**/api/users?*', (route, request) => {
    const url = new URL(request.url());
    if (!isPendingCount(url)) queries.push(Object.fromEntries(url.searchParams));
    return route.fulfill({ json: body(url) });
  });
  return queries;
};

const choose = async (page: Page, select: string, option: string) => {
  await page.getByRole('combobox', { name: select }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

test.describe('admin users page (stubbed API)', () => {
  test('lists pending users; activate is disabled with a tooltip while the email is unverified', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([verified, unverified]) }));

    await page.goto('/app/users');

    await expect(page.getByRole('heading', { name: 'Pending users' })).toBeVisible();
    const verifiedRow = page.getByRole('row', { name: /Vera Verified/ });
    const unverifiedRow = page.getByRole('row', { name: /Uli Unverified/ });
    await expect(verifiedRow.getByRole('button', { name: 'Activate' })).toBeEnabled();
    await expect(unverifiedRow.getByRole('button', { name: /Activate/ })).toBeDisabled();

    await unverifiedRow.getByRole('button', { name: /Activate/ }).locator('..').hover();
    await expect(page.getByRole('tooltip').first()).toContainText('has not verified their email');
  });

  test('activating sends the PATCH, toasts and refreshes the list', async ({ page }) => {
    await signInAs(page, admin);
    let activated = false;
    await page.route('**/api/users?*', (route) =>
      route.fulfill({ json: page1(activated ? [unverified] : [verified, unverified]) })
    );
    await page.route('**/api/users/u1/activate', (route) => {
      activated = true;
      return route.fulfill({ json: { ...verified, status: 'active' } });
    });

    await page.goto('/app/users');
    await page.getByRole('row', { name: /Vera Verified/ }).getByRole('button', { name: 'Activate' }).click();

    await expect(page.getByText('Vera Verified was activated')).toBeVisible();
    await expect(page.getByRole('row', { name: /Vera Verified/ })).toHaveCount(0);
  });

  test('rejecting asks for confirmation first', async ({ page }) => {
    await signInAs(page, admin);
    let rejectCalls = 0;
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([unverified]) }));
    await page.route('**/api/users/u2/reject', (route) => {
      rejectCalls += 1;
      return route.fulfill({ json: { ...unverified, status: 'rejected' } });
    });

    await page.goto('/app/users');
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(rejectCalls).toBe(0);

    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Reject user' }).click();
    await expect(page.getByText('Uli Unverified was rejected')).toBeVisible();
    expect(rejectCalls).toBe(1);
  });

  test('shows the server error as a toast when activation is refused', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([verified]) }));
    await page.route('**/api/users/u1/activate', (route) =>
      route.fulfill({
        status: 400,
        json: { error: { code: 'EMAIL_NOT_VERIFIED', message: 'This user has not verified their email address yet.' } },
      })
    );

    await page.goto('/app/users');
    await page.getByRole('button', { name: 'Activate' }).click();

    await expect(page.getByText('This user has not verified their email address yet.')).toBeVisible();
  });

  test('shows an empty state', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([]) }));

    await page.goto('/app/users');

    await expect(page.getByText('No users are waiting for approval.')).toBeVisible();
  });

  test('active tab: revoke asks for confirmation and never offers revoking yourself', async ({ page }) => {
    await signInAs(page, admin);
    const active = { ...verified, status: 'active' };
    const self = { ...admin, status: 'active', telegramLinked: false, createdAt: '2026-01-01T10:00:00.000Z' };
    let revokeCalls = 0;
    await page.route('**/api/users?*', (route) => {
      const status = new URL(route.request().url()).searchParams.get('status');
      return route.fulfill({ json: page1(status === 'active' ? [self, active] : []) });
    });
    await page.route('**/api/users/u1/reject', (route) => {
      revokeCalls += 1;
      return route.fulfill({ json: { ...active, status: 'rejected' } });
    });

    await page.goto('/app/users');
    await page.getByRole('tab', { name: 'Active' }).click();

    await expect(page.getByRole('heading', { name: 'Active users' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Admin/ }).getByRole('button')).toHaveCount(0);

    await page.getByRole('row', { name: /Vera Verified/ }).getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(revokeCalls).toBe(0);

    await page.getByRole('row', { name: /Vera Verified/ }).getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke user' }).click();
    await expect(page.getByText('Vera Verified was revoked')).toBeVisible();
    expect(revokeCalls).toBe(1);
  });

  test('rejected tab: reactivate sends the PATCH and toasts; unverified users are disabled', async ({ page }) => {
    await signInAs(page, admin);
    const rejected = { ...verified, status: 'rejected' };
    const rejectedUnverified = { ...unverified, status: 'rejected' };
    await page.route('**/api/users?*', (route) => {
      const status = new URL(route.request().url()).searchParams.get('status');
      return route.fulfill({ json: page1(status === 'rejected' ? [rejected, rejectedUnverified] : []) });
    });
    let reactivated = false;
    await page.route('**/api/users/u1/reactivate', (route) => {
      reactivated = true;
      return route.fulfill({ json: { ...rejected, status: 'active' } });
    });

    await page.goto('/app/users');
    await page.getByRole('tab', { name: 'Rejected' }).click();

    await expect(page.getByRole('row', { name: /Uli Unverified/ }).getByRole('button')).toBeDisabled();
    await page.getByRole('row', { name: /Vera Verified/ }).getByRole('button', { name: 'Reactivate' }).click();

    await expect(page.getByText('Vera Verified was reactivated')).toBeVisible();
    expect(reactivated).toBe(true);
  });

  test('staff do not see the Users link and get "no access" on /users', async ({ page }) => {
    await signInAs(page, staff);

    await page.goto('/app/users');

    await expect(page).toHaveURL(/\/app\/users$/);
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  });

  test('admins see the Users link in the nav', async ({ page }) => {
    await signInAs(page, admin);
    await page.route('**/api/users?*', (route) => route.fulfill({ json: page1([]) }));

    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
  });
});

test.describe('users list filters, sort and URL state (stubbed API)', () => {
  test('each toolbar control updates the URL and sends the matching query', async ({ page }) => {
    await signInAs(page, admin);
    const queries = await stubUsers(page);

    await page.goto('/app/users');
    await expect(page.getByRole('row', { name: /Vera Verified/ })).toBeVisible();
    expect(queries.at(-1)).toEqual({ status: 'pending', page: '1', limit: '20', sort: 'createdAt', order: 'desc' });

    await page.getByLabel('Search').fill('vera');
    await expect(page).toHaveURL(/search=vera/);
    await choose(page, 'Role', 'Staff');
    await expect(page).toHaveURL(/role=staff/);
    await choose(page, 'Email status', 'Not verified');
    await expect(page).toHaveURL(/verified=false/);
    await choose(page, 'Sort by', 'Name Z→A');
    await expect(page).toHaveURL(/sort=name&order=desc/);
    await page.getByRole('tab', { name: 'Active' }).click();
    await expect(page).toHaveURL(/status=active/);

    await expect
      .poll(() => queries.at(-1))
      .toEqual({
        status: 'active',
        page: '1',
        limit: '20',
        sort: 'name',
        order: 'desc',
        search: 'vera',
        role: 'staff',
        verified: 'false',
      });
    // Filters persist across tabs
    await expect(page.getByLabel('Search')).toHaveValue('vera');
  });

  test('typing in the search replaces the history entry instead of adding one', async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page);

    await page.goto('/app/dashboard');
    await page.goto('/app/users');
    await page.getByLabel('Search').fill('ve');
    await expect(page).toHaveURL(/search=ve/);
    await page.getByLabel('Search').fill('vera');
    await expect(page).toHaveURL(/search=vera/);

    await page.goBack();
    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });

  test('a reload or deep link restores the controls', async ({ page }) => {
    await signInAs(page, admin);
    const queries = await stubUsers(page, () => ({ ...page1([verified], 3), page: 2, total: 45 }));

    await page.goto('/app/users?status=rejected&search=vera&role=admin&verified=true&sort=createdAt&order=asc&page=2');

    await expect(page.getByRole('tab', { name: 'Rejected' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Search')).toHaveValue('vera');
    await expect(page.getByRole('combobox', { name: 'Role' })).toHaveText('Admin');
    await expect(page.getByRole('combobox', { name: 'Email status' })).toHaveText('Verified');
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveText('Oldest');
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    expect(queries.at(-1)).toEqual({
      status: 'rejected',
      page: '2',
      limit: '20',
      sort: 'createdAt',
      order: 'asc',
      search: 'vera',
      role: 'admin',
      verified: 'true',
    });

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveText('Oldest');
    await expect(page.getByLabel('Search')).toHaveValue('vera');
  });

  test('invalid URL values fall back to the defaults', async ({ page }) => {
    await signInAs(page, admin);
    const queries = await stubUsers(page);

    await page.goto('/app/users?status=nope&search=%20%20&role=owner&verified=maybe&sort=email&order=up&page=-3');

    await expect(page.getByRole('tab', { name: 'Pending' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveText('Newest');
    // A blank search is no filter
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
    expect(queries.at(-1)).toEqual({ status: 'pending', page: '1', limit: '20', sort: 'createdAt', order: 'desc' });
  });

  test('Clear filters resets the filters and keeps the tab and sort', async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page);

    await page.goto('/app/users');
    await expect(page.getByRole('row', { name: /Vera Verified/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);

    await page.goto('/app/users?status=active&search=vera&role=staff&verified=false&sort=name');
    await page.getByRole('button', { name: 'Clear filters' }).click();

    await expect(page).toHaveURL(/\/app\/users\?status=active&sort=name$/);
    await expect(page.getByLabel('Search')).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Role' })).toHaveText('All roles');
    await expect(page.getByRole('combobox', { name: 'Email status' })).toHaveText('Any email status');
    await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  });

  test('a filter, sort or tab change resets the page to 1', async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page, (url) => ({ ...page1([verified], 3), page: Number(url.searchParams.get('page')), total: 45 }));

    await page.goto('/app/users?page=2');
    await expect(page.getByText('Page 2 of 3')).toBeVisible();
    await choose(page, 'Role', 'Admin');
    await expect(page).not.toHaveURL(/page=/);

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await choose(page, 'Sort by', 'Oldest');
    await expect(page).not.toHaveURL(/page=/);

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await page.getByRole('tab', { name: 'Active' }).click();
    await expect(page).not.toHaveURL(/page=/);
  });

  test('a page past the end is replaced by the last page', async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page, (url) => {
      const current = Number(url.searchParams.get('page'));
      return { ...page1(current > 2 ? [] : [verified], 2), page: current, total: 21 };
    });

    await page.goto('/app/users?page=5');

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('row', { name: /Vera Verified/ })).toBeVisible();
  });

  test('says no users match when filters exclude everyone', async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page, () => page1([]));

    await page.goto('/app/users?role=admin');

    await expect(page.getByText('No users match these filters.')).toBeVisible();
    await expect(page.getByText('No users are waiting for approval.')).toHaveCount(0);
  });

  test("shows each user's role", async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page, () => page1([verified, { ...unverified, role: 'admin' }]));

    await page.goto('/app/users');

    await expect(page.getByRole('row', { name: /Vera Verified/ }).getByRole('cell', { name: 'Staff' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Uli Unverified/ }).getByRole('cell', { name: 'Admin' })).toBeVisible();
  });
});

test.describe('last sign-in (stubbed API)', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  test('the Recently active preset writes the URL and sends sort=lastLoginAt', async ({ page }) => {
    await signInAs(page, admin);
    const queries = await stubUsers(page);

    await page.goto('/app/users');
    await expect(page.getByRole('row', { name: /Vera Verified/ })).toBeVisible();
    await choose(page, 'Sort by', 'Recently active');

    await expect(page).toHaveURL(/sort=lastLoginAt&order=desc/);
    await expect.poll(() => queries.at(-1)).toMatchObject({ sort: 'lastLoginAt', order: 'desc' });
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveText('Recently active');
  });

  test('the Last sign-in column shows the date, or "Never"', async ({ page }) => {
    await signInAs(page, admin);
    await stubUsers(page, () => page1([{ ...verified, lastLoginAt: '2026-06-15T12:00:00.000Z' }, unverified]));

    await page.goto('/app/users');

    await expect(page.getByRole('columnheader', { name: 'Last sign-in' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Vera Verified/ }).getByRole('cell', { name: 'Jun 15, 2026' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Uli Unverified/ }).getByRole('cell', { name: 'Never' })).toBeVisible();
  });
});

test.describe('pending count badge (stubbed API)', () => {
  /** A pending-count response: page size 1, only `total` matters. */
  const countPage = (total: number) => ({
    items: total ? [verified] : [],
    page: 1,
    limit: 1,
    total,
    totalPages: Math.max(total, 1),
  });

  /** Stubs GET /api/users: the pending count answers `pending()`, the list answers `list`. */
  const stubPending = async (page: Page, pending: () => number, list: () => unknown = () => page1([verified])) => {
    const countCalls: Record<string, string>[] = [];
    await page.route('**/api/users?*', (route) => {
      const url = new URL(route.request().url());
      if (!isPendingCount(url)) return route.fulfill({ json: list() });
      countCalls.push(Object.fromEntries(url.searchParams));
      return route.fulfill({ json: countPage(pending()) });
    });
    return countCalls;
  };

  const usersLink = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Users/ });
  const pendingTab = (page: Page) => page.getByRole('tab', { name: /^Pending/ });

  test('shows the pending total on the Users link and the Pending tab, ignoring the page filters', async ({ page }) => {
    await signInAs(page, admin);
    const countCalls = await stubPending(page, () => 3);

    await page.goto('/app/users?role=admin&search=vera&sort=name');

    await expect(usersLink(page)).toHaveAccessibleName('Users 3 awaiting approval');
    await expect(pendingTab(page)).toHaveAccessibleName('Pending 3 awaiting approval');
    expect(countCalls.at(-1)).toEqual({ status: 'pending', page: '1', limit: '1', sort: 'createdAt', order: 'desc' });
  });

  test('rises when the window regains focus', async ({ page }) => {
    await signInAs(page, admin);
    let pending = 1;
    await stubPending(page, () => pending);

    await page.goto('/');
    await expect(usersLink(page)).toHaveAccessibleName('Users 1 awaiting approval');

    pending = 4;
    // TanStack Query's focus manager listens for visibilitychange on window
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

    await expect(usersLink(page)).toHaveAccessibleName('Users 4 awaiting approval');
  });

  test('rises on the next poll, a minute later, without a reload', async ({ page }) => {
    await page.clock.install();
    await signInAs(page, admin);
    let pending = 1;
    const countCalls = await stubPending(page, () => pending);

    await page.goto('/');
    await expect(usersLink(page)).toHaveAccessibleName('Users 1 awaiting approval');
    const callsBefore = countCalls.length;

    pending = 2;
    await page.clock.runFor(59_000);
    expect(countCalls.length).toBe(callsBefore);
    await page.clock.runFor(1_000);

    await expect(usersLink(page)).toHaveAccessibleName('Users 2 awaiting approval');
  });

  test('shows the badge in the mobile drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signInAs(page, admin);
    await stubPending(page, () => 2);

    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    await expect(page.getByRole('dialog').getByRole('link', { name: /^Users/ })).toHaveAccessibleName(
      'Users 2 awaiting approval'
    );
  });

  test('drops after Activate', async ({ page }) => {
    await signInAs(page, admin);
    let pending = [verified, unverified];
    await stubPending(page, () => pending.length, () => page1(pending));
    await page.route('**/api/users/u1/activate', (route) => {
      pending = [unverified];
      return route.fulfill({ json: { ...verified, status: 'active' } });
    });

    await page.goto('/app/users');
    await expect(pendingTab(page)).toHaveAccessibleName('Pending 2 awaiting approval');
    await page.getByRole('row', { name: /Vera Verified/ }).getByRole('button', { name: 'Activate' }).click();

    await expect(pendingTab(page)).toHaveAccessibleName('Pending 1 awaiting approval');
    await expect(usersLink(page)).toHaveAccessibleName('Users 1 awaiting approval');
  });

  test('drops after Reject, and is gone at 0', async ({ page }) => {
    await signInAs(page, admin);
    let pending = [unverified];
    await stubPending(page, () => pending.length, () => page1(pending));
    await page.route('**/api/users/u2/reject', (route) => {
      pending = [];
      return route.fulfill({ json: { ...unverified, status: 'rejected' } });
    });

    await page.goto('/app/users');
    await expect(usersLink(page)).toHaveAccessibleName('Users 1 awaiting approval');
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('button', { name: 'Reject user' }).click();

    await expect(usersLink(page)).toHaveAccessibleName('Users');
    await expect(pendingTab(page)).toHaveAccessibleName('Pending');
  });

  test('staff get no badge and send no /users request', async ({ page }) => {
    await signInAs(page, staff);
    const usersCalls: string[] = [];
    await page.route('**/api/users?*', (route) => {
      usersCalls.push(route.request().url());
      return route.fulfill({ json: countPage(5) });
    });

    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Products' })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

    await expect(page.getByText('awaiting approval')).toHaveCount(0);
    expect(usersCalls).toEqual([]);
  });
});
